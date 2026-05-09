import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Delivery batching (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await deleteDeliveryTestData(prisma);
  });

  afterEach(async () => {
    await deleteDeliveryTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists ready orders with delivery_status waiting_batch', async () => {
    const fixture = await createDeliveryFixture(prisma);

    const response = await request(app.getHttpServer())
      .get('/delivery/ready-orders')
      .query({ destinationBranchId: fixture.destinationBranchId })
      .set('x-permissions', 'delivery:batch_create')
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.data.map((order: { id: string }) => order.id)).toEqual(
      expect.arrayContaining([
        fixture.readyOrderIds[0],
        fixture.readyOrderIds[1],
      ]),
    );
  });

  it('creates a batch for same destination branch and marks orders added_to_delivery_batch', async () => {
    const fixture = await createDeliveryFixture(prisma);

    const response = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .set('x-actor-id', 'delivery-coordinator')
      .send({
        orderIds: fixture.readyOrderIds,
        idempotencyKey: 'delivery-test-same-destination',
      })
      .expect(201);

    expect(response.body.destinationBranchId).toBe(fixture.destinationBranchId);
    expect(response.body.orders).toHaveLength(2);
    await expect(
      prisma.order.count({
        where: {
          id: { in: fixture.readyOrderIds },
          deliveryStatus: 'ADDED_TO_DELIVERY_BATCH',
        },
      }),
    ).resolves.toBe(2);
  });

  it('batch creation is idempotent', async () => {
    const fixture = await createDeliveryFixture(prisma);

    const first = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: fixture.readyOrderIds,
        idempotencyKey: 'delivery-test-idempotent',
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: fixture.readyOrderIds,
        idempotencyKey: 'delivery-test-idempotent',
      })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    await expect(prisma.deliveryBatch.count()).resolves.toBe(1);
    await expect(prisma.deliveryBatchOrder.count()).resolves.toBe(2);
  });

  it('rejects mixed destination branches', async () => {
    const fixture = await createDeliveryFixture(prisma);

    const response = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: [fixture.readyOrderIds[0], fixture.otherDestinationOrderId],
      })
      .expect(400);

    expect(response.body.code).toBe('MIXED_DESTINATION_BRANCHES');
  });

  it('rejects non-ready orders', async () => {
    const fixture = await createDeliveryFixture(prisma);

    const response = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: [fixture.readyOrderIds[0], fixture.nonReadyOrderId],
      })
      .expect(400);

    expect(response.body.code).toBe('ORDER_NOT_READY_FOR_DELIVERY_BATCH');
  });

  it('driver sees only assigned batches', async () => {
    const fixture = await createDeliveryFixture(prisma);
    const assigned = await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: fixture.readyOrderIds,
        idempotencyKey: 'delivery-test-driver-assigned',
      })
      .expect(201);
    const unassignedOrder = await createReadyOrder(prisma, {
      sourceBranchId: fixture.sourceBranchId,
      destinationBranchId: fixture.destinationBranchId,
      suffix: 'UNASSIGNED',
    });
    await request(app.getHttpServer())
      .post('/delivery/batches')
      .set('x-permissions', 'delivery:batch_create')
      .send({
        orderIds: [unassignedOrder.id],
        idempotencyKey: 'delivery-test-driver-other',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/delivery/batches/${assigned.body.id}/assign-driver`)
      .set('x-permissions', 'delivery:assign_driver')
      .set('x-actor-id', 'delivery-dispatcher')
      .send({ driverId: 'driver-1' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/delivery/driver/batches')
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-1')
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(assigned.body.id);
    expect(response.body[0].driverId).toBe('driver-1');
  });

  it('unauthorized driver cannot see or update another assigned batch', async () => {
    const fixture = await createDeliveryFixture(prisma);
    const batch = await createAssignedBatch(
      app,
      fixture.readyOrderIds,
      'driver-a',
    );

    const list = await request(app.getHttpServer())
      .get('/delivery/driver/batches')
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-b')
      .expect(200);
    expect(list.body).toHaveLength(0);

    await request(app.getHttpServer())
      .post(`/delivery/driver/batches/${batch.id}/picked-up`)
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-b')
      .expect(404);
  });

  it('picked_up cascades to batch orders and orders', async () => {
    const fixture = await createDeliveryFixture(prisma);
    const batch = await createAssignedBatch(
      app,
      fixture.readyOrderIds,
      'driver-pick',
    );

    const response = await request(app.getHttpServer())
      .post(`/delivery/driver/batches/${batch.id}/picked-up`)
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-pick')
      .expect(201);

    expect(response.body.status).toBe('PICKED_UP');
    expect(
      response.body.orders.map(
        (item: { status: string; order: { deliveryStatus: string } }) => ({
          batchOrderStatus: item.status,
          orderStatus: item.order.deliveryStatus,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { batchOrderStatus: 'PICKED_UP', orderStatus: 'PICKED_UP' },
        { batchOrderStatus: 'PICKED_UP', orderStatus: 'PICKED_UP' },
      ]),
    );
  });

  it('delivered cascades to batch orders and orders with proof fields', async () => {
    const fixture = await createDeliveryFixture(prisma);
    const batch = await createAssignedBatch(
      app,
      fixture.readyOrderIds,
      'driver-done',
    );

    await request(app.getHttpServer())
      .post(`/delivery/driver/batches/${batch.id}/picked-up`)
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-done')
      .expect(201);
    await request(app.getHttpServer())
      .post(`/delivery/driver/batches/${batch.id}/out-for-delivery`)
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-done')
      .expect(201);
    const response = await request(app.getHttpServer())
      .post(`/delivery/driver/batches/${batch.id}/delivered`)
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-done')
      .send({ receivedByName: 'سلمان', notes: 'تم التسليم' })
      .expect(201);

    expect(response.body.status).toBe('DELIVERED');
    for (const item of response.body.orders as Array<{
      status: string;
      receivedByName: string;
      deliveredAt: string;
      deliveryNotes: string;
      order: { deliveryStatus: string };
    }>) {
      expect(item.status).toBe('DELIVERED');
      expect(item.order.deliveryStatus).toBe('DELIVERED');
      expect(item.receivedByName).toBe('سلمان');
      expect(item.deliveredAt).toBeTruthy();
      expect(item.deliveryNotes).toBe('تم التسليم');
    }
  });

  it('returned order stores standardized reason', async () => {
    const original = process.env.ALLOW_PARTIAL_DELIVERY;
    process.env.ALLOW_PARTIAL_DELIVERY = 'true';
    const fixture = await createDeliveryFixture(prisma);
    const batch = await createAssignedBatch(
      app,
      fixture.readyOrderIds,
      'driver-return',
    );

    const missingReason = await request(app.getHttpServer())
      .post(
        `/delivery/driver/batches/${batch.id}/orders/${fixture.readyOrderIds[0]}/returned`,
      )
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-return')
      .send({})
      .expect(400);
    expect(missingReason.body.code).toBe('DELIVERY_RETURN_REASON_REQUIRED');

    const response = await request(app.getHttpServer())
      .post(
        `/delivery/driver/batches/${batch.id}/orders/${fixture.readyOrderIds[0]}/returned`,
      )
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-return')
      .send({ reasonCode: 'CUSTOMER_UNAVAILABLE', notes: 'لا يوجد رد' })
      .expect(201);

    const returned = response.body.orders.find(
      (item: { orderId: string }) => item.orderId === fixture.readyOrderIds[0],
    );
    expect(returned.status).toBe('RETURNED');
    expect(returned.returnReasonCode).toBe('CUSTOMER_UNAVAILABLE');
    expect(returned.returnNotes).toBe('لا يوجد رد');
    expect(returned.order.deliveryStatus).toBe('RETURNED');
    restoreOptionalEnv('ALLOW_PARTIAL_DELIVERY', original);
  });

  it('partial delivery updates batch partially_delivered when enabled', async () => {
    const original = process.env.ALLOW_PARTIAL_DELIVERY;
    process.env.ALLOW_PARTIAL_DELIVERY = 'true';
    const fixture = await createDeliveryFixture(prisma);
    const batch = await createAssignedBatch(
      app,
      fixture.readyOrderIds,
      'driver-partial',
    );

    const response = await request(app.getHttpServer())
      .post(
        `/delivery/driver/batches/${batch.id}/orders/${fixture.readyOrderIds[0]}/delivered`,
      )
      .set('x-permissions', 'delivery_driver')
      .set('x-driver-id', 'driver-partial')
      .send({ receivedByName: 'نورة' })
      .expect(201);

    expect(response.body.status).toBe('PARTIALLY_DELIVERED');
    const delivered = response.body.orders.find(
      (item: { orderId: string }) => item.orderId === fixture.readyOrderIds[0],
    );
    const pending = response.body.orders.find(
      (item: { orderId: string }) => item.orderId === fixture.readyOrderIds[1],
    );
    expect(delivered.status).toBe('DELIVERED');
    expect(delivered.order.deliveryStatus).toBe('DELIVERED');
    expect(pending.status).toBe('ADDED_TO_BATCH');
    restoreOptionalEnv('ALLOW_PARTIAL_DELIVERY', original);
  });
});

async function createAssignedBatch(
  app: INestApplication,
  orderIds: string[],
  driverId: string,
) {
  const batch = await request(app.getHttpServer())
    .post('/delivery/batches')
    .set('x-permissions', 'delivery:batch_create')
    .send({
      orderIds,
      idempotencyKey: `delivery-test-${driverId}-${orderIds.join('-')}`,
    })
    .expect(201);
  const assigned = await request(app.getHttpServer())
    .post(`/delivery/batches/${batch.body.id}/assign-driver`)
    .set('x-permissions', 'delivery:assign_driver')
    .send({ driverId })
    .expect(201);
  return assigned.body as { id: string };
}

async function createDeliveryFixture(prisma: PrismaService) {
  const suffix = Math.random().toString(16).slice(2, 8);
  const sourceBranch = await prisma.branch.create({
    data: {
      code: `DBS_${suffix}`,
      nameAr: 'فرع مصدر التوصيل',
      nameEn: 'Delivery Source Branch',
    },
  });
  const destinationBranch = await prisma.branch.create({
    data: {
      code: `DBD_${suffix}`,
      nameAr: 'فرع وجهة التوصيل',
      nameEn: 'Delivery Destination Branch',
    },
  });
  const otherDestinationBranch = await prisma.branch.create({
    data: {
      code: `DBO_${suffix}`,
      nameAr: 'فرع وجهة آخر',
      nameEn: 'Other Destination Branch',
    },
  });
  const readyA = await createReadyOrder(prisma, {
    sourceBranchId: sourceBranch.id,
    destinationBranchId: destinationBranch.id,
    suffix: `${suffix}_A`,
  });
  const readyB = await createReadyOrder(prisma, {
    sourceBranchId: sourceBranch.id,
    destinationBranchId: destinationBranch.id,
    suffix: `${suffix}_B`,
  });
  const otherDestination = await createReadyOrder(prisma, {
    sourceBranchId: sourceBranch.id,
    destinationBranchId: otherDestinationBranch.id,
    suffix: `${suffix}_C`,
  });
  const nonReady = await prisma.order.create({
    data: {
      orderNumber: `DBT-${suffix}-N`,
      branchId: sourceBranch.id,
      destinationBranchId: destinationBranch.id,
      customerName: 'عميل غير جاهز',
      status: 'APPROVED',
      deliveryStatus: 'READY',
    },
  });

  return {
    sourceBranchId: sourceBranch.id,
    destinationBranchId: destinationBranch.id,
    readyOrderIds: [readyA.id, readyB.id],
    otherDestinationOrderId: otherDestination.id,
    nonReadyOrderId: nonReady.id,
  };
}

function createReadyOrder(
  prisma: PrismaService,
  input: {
    sourceBranchId: string;
    destinationBranchId: string;
    suffix: string;
  },
) {
  return prisma.order.create({
    data: {
      orderNumber: `DBT-${input.suffix}`,
      branchId: input.sourceBranchId,
      destinationBranchId: input.destinationBranchId,
      customerName: 'عميل جاهز للتوصيل',
      status: 'APPROVED',
      deliveryStatus: 'WAITING_BATCH',
    },
  });
}

async function deleteDeliveryTestData(prisma: PrismaService) {
  await prisma.deliveryBatchOrder.deleteMany();
  await prisma.deliveryBatch.deleteMany({
    where: { batchNumber: { startsWith: 'DB-' } },
  });
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'DBT-' } },
  });
  await prisma.branch.deleteMany({
    where: {
      OR: [
        { code: { startsWith: 'DBS_' } },
        { code: { startsWith: 'DBD_' } },
        { code: { startsWith: 'DBO_' } },
      ],
    },
  });
  await prisma.auditLog.deleteMany({
    where: { action: { startsWith: 'delivery.' } },
  });
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
