import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fulfillment (e2e)', () => {
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
    await deleteFulfillmentTestData(prisma);
  });

  afterEach(async () => {
    await deleteFulfillmentTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('order with cake and pastry creates two work orders', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .set('x-actor-id', 'fulfillment-coordinator')
      .expect(201);

    expect(response.body.idempotencyKey).toBe(
      `create_department_work_orders:${fixture.orderId}`,
    );
    expect(response.body.workOrders).toHaveLength(2);
    expect(
      response.body.workOrders.map(
        (workOrder: { departmentId: string; items: unknown[] }) => ({
          departmentId: workOrder.departmentId,
          itemCount: workOrder.items.length,
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { departmentId: fixture.cakeDepartmentId, itemCount: 1 },
        { departmentId: fixture.pastryDepartmentId, itemCount: 1 },
      ]),
    );
  });

  it('missing mapping blocks operation with MISSING_DEPARTMENT_MAPPING and creates no work orders', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app, {
      skipPastryMapping: true,
    });

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .expect(400);

    expect(response.body.code).toBe('MISSING_DEPARTMENT_MAPPING');
    await expect(
      prisma.workOrder.count({ where: { orderId: fixture.orderId } }),
    ).resolves.toBe(0);
  });

  it('second split request returns existing result and creates no duplicates', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .expect(201);

    expect(second.body.workOrders).toHaveLength(2);
    await expect(
      prisma.workOrder.count({ where: { orderId: fixture.orderId } }),
    ).resolves.toBe(2);
    await expect(
      prisma.workOrderItem.count({
        where: { workOrder: { orderId: fixture.orderId } },
      }),
    ).resolves.toBe(2);
  });

  it('order links to all created work orders', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .expect(201);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      include: { workOrders: true },
    });
    expect(order.workOrders).toHaveLength(2);
  });

  it('fulfillment queue returns approved scoped orders', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    const response = await request(app.getHttpServer())
      .get('/fulfillment/queue')
      .set('x-permissions', 'orders:view,orders:view_branch')
      .set('x-branch-id', fixture.branchId)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].id).toBe(fixture.orderId);
  });

  it('requires fulfillment_coordinator permission for split', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'orders:view')
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('allows department override only when enabled', async () => {
    const original = process.env.ALLOW_DEPARTMENT_OVERRIDE;
    process.env.ALLOW_DEPARTMENT_OVERRIDE = 'false';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
      include: { items: true },
    });
    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/split-by-department`)
      .set('x-permissions', 'fulfillment_coordinator')
      .send({
        overrides: [
          {
            orderItemId: order.items[0].id,
            productionCenterId: fixture.productionCenterId,
            departmentId: fixture.cakeDepartmentId,
          },
        ],
      })
      .expect(400);

    expect(response.body.code).toBe('DEPARTMENT_OVERRIDE_NOT_ALLOWED');
    restoreOptionalEnv('ALLOW_DEPARTMENT_OVERRIDE', original);
  });

  it('production operator queue and actions enforce department scope', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const workOrders = await splitFixture(app, fixture.orderId);
    const pastryWorkOrder = workOrders.find(
      (workOrder) => workOrder.departmentId === fixture.pastryDepartmentId,
    );

    const queue = await request(app.getHttpServer())
      .get('/fulfillment/production/work-orders')
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', fixture.cakeDepartmentId)
      .expect(200);

    expect(queue.body.total).toBe(1);
    expect(queue.body.data[0].departmentId).toBe(fixture.cakeDepartmentId);

    const forbidden = await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${pastryWorkOrder?.id}/accept`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', fixture.cakeDepartmentId)
      .expect(403);
    expect(forbidden.body.code).toBe('DEPARTMENT_SCOPE_FORBIDDEN');
  });

  it('all ready updates order production status and sets lifecycle timestamps', async () => {
    const original = process.env.ENABLE_PACKING_STAGE;
    process.env.ENABLE_PACKING_STAGE = 'false';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const workOrders = await splitFixture(app, fixture.orderId);

    for (const workOrder of workOrders) {
      const accepted = await request(app.getHttpServer())
        .post(`/fulfillment/work-orders/${workOrder.id}/accept`)
        .set('x-permissions', 'production_operator')
        .set('x-department-ids', workOrder.departmentId)
        .expect(201);
      expect(accepted.body.acceptedAt).toBeTruthy();

      const started = await request(app.getHttpServer())
        .post(`/fulfillment/work-orders/${workOrder.id}/in-production`)
        .set('x-permissions', 'production_operator')
        .set('x-department-ids', workOrder.departmentId)
        .expect(201);
      expect(started.body.startedAt).toBeTruthy();

      const ready = await request(app.getHttpServer())
        .post(`/fulfillment/work-orders/${workOrder.id}/ready`)
        .set('x-permissions', 'production_operator')
        .set('x-department-ids', workOrder.departmentId)
        .expect(201);
      expect(ready.body.status).toBe('READY');
      expect(ready.body.readyAt).toBeTruthy();
    }

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    expect(order.productionStatus).toBe('COMPLETED');
    expect(order.deliveryStatus).toBe('READY');
    restoreOptionalEnv('ENABLE_PACKING_STAGE', original);
  });

  it('one rejected work order updates order production status to rejected', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const [workOrder] = await splitFixture(app, fixture.orderId);

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/reject`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .send({ reasonCode: 'CANNOT_FULFILL' })
      .expect(201);

    expect(response.body.status).toBe('REJECTED');
    expect(response.body.rejectReasonCode).toBe('CANNOT_FULFILL');
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    expect(order.productionStatus).toBe('REJECTED');
  });

  it('delay requires standardized reason and stores it', async () => {
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const [workOrder] = await splitFixture(app, fixture.orderId);
    await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/accept`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .expect(201);

    const missingReason = await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/delay`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .send({})
      .expect(400);
    expect(missingReason.body.code).toBe('STANDARDIZED_REASON_REQUIRED');

    const delayed = await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/delay`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .send({ reasonCode: 'MATERIAL_SHORTAGE', notes: 'سكر ناقص' })
      .expect(201);

    expect(delayed.body.status).toBe('DELAYED');
    expect(delayed.body.delayReasonCode).toBe('MATERIAL_SHORTAGE');
    expect(delayed.body.statusNotes).toBe('سكر ناقص');
    expect(delayed.body.delayedAt).toBeTruthy();
  });

  it('with packing enabled, order becomes ready_for_packing first and packed order waits for batch', async () => {
    const original = process.env.ENABLE_PACKING_STAGE;
    process.env.ENABLE_PACKING_STAGE = 'true';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const workOrders = await splitFixture(app, fixture.orderId);
    process.env.ENABLE_PACKING_STAGE = 'false';

    await readyAllWorkOrders(app, workOrders);

    const readyForPacking = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    expect(readyForPacking.productionStatus).toBe('COMPLETED');
    expect(readyForPacking.deliveryStatus).toBe('READY_FOR_PACKING');
    expect(readyForPacking.packingRequired).toBe(true);
    expect(readyForPacking.workflowSettingsSnapshot).toEqual(
      expect.objectContaining({
        enablePackingStage: true,
        packingRequired: true,
      }),
    );

    const packed = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/pack`)
      .set('x-permissions', 'packing:pack')
      .expect(201);

    expect(packed.body.deliveryStatus).toBe('WAITING_BATCH');
    restoreOptionalEnv('ENABLE_PACKING_STAGE', original);
  });

  it('with packing disabled, order becomes ready directly', async () => {
    const original = process.env.ENABLE_PACKING_STAGE;
    process.env.ENABLE_PACKING_STAGE = 'false';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const workOrders = await splitFixture(app, fixture.orderId);

    await readyAllWorkOrders(app, workOrders);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: fixture.orderId },
    });
    expect(order.productionStatus).toBe('COMPLETED');
    expect(order.deliveryStatus).toBe('READY');
    expect(order.packingRequired).toBe(false);
    expect(order.workflowSettingsSnapshot).toEqual(
      expect.objectContaining({
        enablePackingStage: false,
        packingRequired: false,
      }),
    );
    restoreOptionalEnv('ENABLE_PACKING_STAGE', original);
  });

  it('not all ready cannot be packed', async () => {
    const original = process.env.ENABLE_PACKING_STAGE;
    process.env.ENABLE_PACKING_STAGE = 'true';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    await splitFixture(app, fixture.orderId);

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/pack`)
      .set('x-permissions', 'packing:pack')
      .expect(400);

    expect(response.body.code).toBe('WORK_ORDERS_NOT_READY');
    restoreOptionalEnv('ENABLE_PACKING_STAGE', original);
  });

  it('packing action requires permission', async () => {
    const original = process.env.ENABLE_PACKING_STAGE;
    process.env.ENABLE_PACKING_STAGE = 'true';
    const fixture = await createApprovedFulfillmentFixture(prisma, app);
    const workOrders = await splitFixture(app, fixture.orderId);
    await readyAllWorkOrders(app, workOrders);

    const response = await request(app.getHttpServer())
      .post(`/fulfillment/orders/${fixture.orderId}/pack`)
      .set('x-permissions', 'orders:view')
      .expect(403);

    expect(response.body.code).toBe('FORBIDDEN');
    restoreOptionalEnv('ENABLE_PACKING_STAGE', original);
  });
});

type WorkOrderResponse = { id: string; departmentId: string };

async function splitFixture(app: INestApplication, orderId: string) {
  const response = await request(app.getHttpServer())
    .post(`/fulfillment/orders/${orderId}/split-by-department`)
    .set('x-permissions', 'fulfillment_coordinator')
    .expect(201);
  return response.body.workOrders as WorkOrderResponse[];
}

async function readyAllWorkOrders(
  app: INestApplication,
  workOrders: WorkOrderResponse[],
) {
  for (const workOrder of workOrders) {
    await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/accept`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/in-production`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/fulfillment/work-orders/${workOrder.id}/ready`)
      .set('x-permissions', 'production_operator')
      .set('x-department-ids', workOrder.departmentId)
      .expect(201);
  }
}

async function createApprovedFulfillmentFixture(
  prisma: PrismaService,
  app: INestApplication,
  options: { skipPastryMapping?: boolean } = {},
) {
  const suffix = Math.random().toString(16).slice(2, 8);
  const branch = await prisma.branch.create({
    data: {
      code: `FB_${suffix}`,
      nameAr: 'فرع الوفاء',
      nameEn: 'Fulfillment Branch',
    },
  });
  const productionCenter = await prisma.productionCenter.create({
    data: {
      branchId: branch.id,
      code: `FPC_${suffix}`,
      nameAr: 'مركز الإنتاج الرئيسي',
      nameEn: 'Main Production Center',
    },
  });
  const cakeDepartment = await prisma.department.create({
    data: {
      code: `FCAKE_${suffix}`,
      nameAr: 'قسم الكيك',
      nameEn: 'Cake Department',
    },
  });
  const pastryDepartment = await prisma.department.create({
    data: {
      code: `FPASTRY_${suffix}`,
      nameAr: 'قسم المعجنات',
      nameEn: 'Pastry Department',
    },
  });
  const cake = await prisma.product.create({
    data: {
      code: `FCAKEP_${suffix}`,
      nameAr: 'كيكة اختبار',
      nameEn: 'Test Cake',
      erpnextItemCode: `ERP-FUL-CAKE-${suffix}`,
    },
  });
  const pastry = await prisma.product.create({
    data: {
      code: `FPASTRYP_${suffix}`,
      nameAr: 'معجنات اختبار',
      nameEn: 'Test Pastry',
      erpnextItemCode: `ERP-FUL-PASTRY-${suffix}`,
    },
  });

  await prisma.itemDepartmentMapping.create({
    data: {
      productId: cake.id,
      departmentId: cakeDepartment.id,
      productionCenterId: productionCenter.id,
    },
  });
  if (!options.skipPastryMapping) {
    await prisma.itemDepartmentMapping.create({
      data: {
        productId: pastry.id,
        departmentId: pastryDepartment.id,
        productionCenterId: productionCenter.id,
      },
    });
  }

  const created = await request(app.getHttpServer())
    .post('/orders')
    .set('x-permissions', 'orders:create')
    .set('x-actor-id', 'fulfillment-e2e')
    .send({
      branchId: branch.id,
      customerName: 'عميل الوفاء',
      customerPhone: '+966511111111',
      items: [
        { productId: cake.id, quantity: 1, unitPrice: 100 },
        { productId: pastry.id, quantity: 2, unitPrice: 25 },
      ],
    })
    .expect(201);
  await request(app.getHttpServer())
    .post(`/orders/${created.body.id}/submit-for-approval`)
    .set('x-permissions', 'orders:submit,orders:view_branch')
    .set('x-branch-id', branch.id)
    .expect(201);
  await request(app.getHttpServer())
    .post(`/orders/${created.body.id}/approve`)
    .set('x-permissions', 'orders:approve,orders:view_branch')
    .set('x-branch-id', branch.id)
    .expect(201);

  return {
    orderId: created.body.id as string,
    branchId: branch.id,
    productionCenterId: productionCenter.id,
    cakeDepartmentId: cakeDepartment.id,
    pastryDepartmentId: pastryDepartment.id,
  };
}

async function deleteFulfillmentTestData(prisma: PrismaService) {
  await prisma.workOrderItem.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.notification.deleteMany({
    where: { entityType: { in: ['order', 'work_order'] } },
  });
  await prisma.orderItem.deleteMany({
    where: { order: { orderNumber: { startsWith: 'ORD-FB_' } } },
  });
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'ORD-FB_' } },
  });
  await prisma.itemDepartmentMapping.deleteMany({
    where: {
      OR: [
        { product: { code: { startsWith: 'FCAKEP_' } } },
        { product: { code: { startsWith: 'FPASTRYP_' } } },
        { product: { code: { startsWith: 'FUL_' } } },
        { department: { code: { startsWith: 'FCAKE_' } } },
        { department: { code: { startsWith: 'FPASTRY_' } } },
        { department: { code: { startsWith: 'FUL_' } } },
      ],
    },
  });
  await prisma.product.deleteMany({
    where: {
      OR: [
        { code: { startsWith: 'FCAKEP_' } },
        { code: { startsWith: 'FPASTRYP_' } },
        { code: { startsWith: 'FUL_' } },
      ],
    },
  });
  await prisma.department.deleteMany({
    where: {
      OR: [
        { code: { startsWith: 'FCAKE_' } },
        { code: { startsWith: 'FPASTRY_' } },
        { code: { startsWith: 'FUL_' } },
      ],
    },
  });
  await prisma.productionCenter.deleteMany({
    where: {
      OR: [{ code: { startsWith: 'FPC_' } }, { code: { startsWith: 'FUL_' } }],
    },
  });
  await prisma.branch.deleteMany({
    where: {
      OR: [{ code: { startsWith: 'FB_' } }, { code: { startsWith: 'FUL_' } }],
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { action: { startsWith: 'fulfillment.' } },
        { action: { startsWith: 'order.' } },
      ],
    },
  });
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
