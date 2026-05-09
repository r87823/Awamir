import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ERPNextSyncService } from '../src/erpnext/erpnext-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let erpnextSync: ERPNextSyncService;
  let branchAId: string;
  let branchBId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    erpnextSync = app.get(ERPNextSyncService);
  });

  beforeEach(async () => {
    await deleteOrderTestData(prisma);
    const branchA = await prisma.branch.create({
      data: {
        code: `ORD_A_${Date.now()}`,
        nameAr: 'فرع اختبار أ',
        nameEn: 'Order Test A',
      },
    });
    const branchB = await prisma.branch.create({
      data: {
        code: `ORD_B_${Date.now()}`,
        nameAr: 'فرع اختبار ب',
        nameEn: 'Order Test B',
      },
    });
    const product = await prisma.product.create({
      data: {
        code: `ORD_PRODUCT_${Date.now()}`,
        nameAr: 'منتج طلب اختبار',
        nameEn: 'Order Test Product',
        erpnextItemCode: `ERP-ORD-${Date.now()}`,
      },
    });
    branchAId = branchA.id;
    branchBId = branchB.id;
    productId = product.id;
  });

  afterEach(async () => {
    await deleteOrderTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('can create draft order and calculates totals', async () => {
    const response = await createDraftOrder(app, branchAId, productId, 2, 10.5);

    expect(response.body).toEqual(
      expect.objectContaining({
        branchId: branchAId,
        customerName: 'عميل اختبار',
        status: OrderStatus.DRAFT,
        subtotal: '21',
        grandTotal: '21',
      }),
    );
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        erpnextItemCode: expect.stringContaining('ERP-ORD-'),
        itemName: 'منتج طلب اختبار',
        unitPrice: '10.5',
        lineTotal: '21',
      }),
    );
    await expect(
      prisma.auditLog.count({ where: { action: 'order.created' } }),
    ).resolves.toBe(1);
  });

  it('cannot edit pending_approval', async () => {
    const created = await createDraftOrder(app, branchAId, productId, 1, 5);
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/transitions/submit`)
      .set('x-permissions', 'orders:update')
      .expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}`)
      .set('x-permissions', 'orders:update')
      .send({ version: 2, customerName: 'تعديل ممنوع' })
      .expect(400);

    expect(response.body.code).toBe('ORDER_EDIT_NOT_ALLOWED');
  });

  it('invalid transition returns INVALID_STATUS_TRANSITION', async () => {
    const created = await createDraftOrder(app, branchAId, productId, 1, 5);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/transitions/approve`)
      .set('x-permissions', 'orders:update')
      .expect(400);

    expect(response.body.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('branch user cannot view another branch order', async () => {
    const created = await createDraftOrder(app, branchAId, productId, 1, 5);

    const response = await request(app.getHttpServer())
      .get(`/orders/${created.body.id}`)
      .set('x-permissions', 'orders:view,orders:view_branch')
      .set('x-branch-id', branchBId)
      .expect(403);

    expect(response.body.code).toBe('BRANCH_SCOPE_FORBIDDEN');
  });

  it('supports pagination and status filters', async () => {
    await createDraftOrder(app, branchAId, productId, 1, 5);

    const response = await request(app.getHttpServer())
      .get('/orders')
      .query({
        branchId: branchAId,
        status: OrderStatus.DRAFT,
        page: 1,
        pageSize: 10,
      })
      .set('x-permissions', 'orders:view')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 10,
        total: 1,
      }),
    );
    expect(response.body.data).toHaveLength(1);
  });

  it('rejects stale optimistic locking versions', async () => {
    const created = await createDraftOrder(app, branchAId, productId, 1, 5);

    await request(app.getHttpServer())
      .patch(`/orders/${created.body.id}`)
      .set('x-permissions', 'orders:update')
      .send({ version: 999, customerName: 'نسخة قديمة' })
      .expect(409);
  });

  it('draft -> pending_approval via submit_for_approval for scoped branch operator', async () => {
    const created = await createDraftOrder(app, branchAId, productId, 1, 5);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/submit-for-approval`)
      .set('x-permissions', 'orders:submit,orders:view_branch')
      .set('x-branch-id', branchAId)
      .set('x-actor-id', 'branch-operator')
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.PENDING_APPROVAL);
    await expect(
      prisma.notification.count({
        where: { type: 'ORDER_SUBMITTED_FOR_APPROVAL' },
      }),
    ).resolves.toBe(1);
  });

  it('pending_approval -> approved for scoped branch supervisor', async () => {
    const created = await createPendingOrder(app, branchAId, productId);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .set('x-actor-id', 'branch-supervisor')
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.APPROVED);
    await expect(
      prisma.auditLog.count({ where: { action: 'order.approved' } }),
    ).resolves.toBe(1);
  });

  it('branch supervisor cannot approve another branch order', async () => {
    const created = await createPendingOrder(app, branchAId, productId);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchBId)
      .expect(403);

    expect(response.body.code).toBe('BRANCH_SCOPE_FORBIDDEN');
  });

  it('pending_approval -> rejected requires reason', async () => {
    const created = await createPendingOrder(app, branchAId, productId);

    const missingReason = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/reject`)
      .set('x-permissions', 'orders:reject,orders:view_branch')
      .set('x-branch-id', branchAId)
      .send({})
      .expect(400);
    expect(missingReason.body.code).toBe('REJECTION_REASON_REQUIRED');

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/reject`)
      .set('x-permissions', 'orders:reject,orders:view_branch')
      .set('x-branch-id', branchAId)
      .send({ rejectionReason: 'بيانات العميل غير مكتملة' })
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.REJECTED);
    expect(response.body.rejectionReason).toBe('بيانات العميل غير مكتملة');
  });

  it('pending_approval -> returned_for_edit requires notes', async () => {
    const created = await createPendingOrder(app, branchAId, productId);

    const missingNotes = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/return-for-edit`)
      .set('x-permissions', 'orders:return_for_edit,orders:view_branch')
      .set('x-branch-id', branchAId)
      .send({})
      .expect(400);
    expect(missingNotes.body.code).toBe('RETURN_NOTES_REQUIRED');

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/return-for-edit`)
      .set('x-permissions', 'orders:return_for_edit,orders:view_branch')
      .set('x-branch-id', branchAId)
      .send({ notes: 'راجع الكمية' })
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.RETURNED_FOR_EDIT);
    expect(response.body.returnNotes).toBe('راجع الكمية');
  });

  it('approval creates ERPNext outbox only when setting enabled and remains idempotent', async () => {
    const original = process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER;
    process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER = 'true';
    const created = await createPendingOrder(app, branchAId, productId);

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(201);

    await expect(
      prisma.integrationOutbox.count({
        where: { idempotencyKey: `erpnext:sales_order:${created.body.id}` },
      }),
    ).resolves.toBe(1);
    restoreOptionalEnv('ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER', original);
  });

  it('approval does not create ERPNext outbox when setting disabled', async () => {
    const original = process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER;
    process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER = 'false';
    const created = await createPendingOrder(app, branchAId, productId);

    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(201);

    await expect(
      prisma.integrationOutbox.count({
        where: { idempotencyKey: `erpnext:sales_order:${created.body.id}` },
      }),
    ).resolves.toBe(0);
    restoreOptionalEnv('ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER', original);
  });

  it('approval logs ERPNext enqueue failure without failing approval', async () => {
    const original = process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER;
    process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER = 'true';
    const spy = jest
      .spyOn(erpnextSync, 'createSalesOrder')
      .mockRejectedValueOnce(new Error('enqueue unavailable'));
    const created = await createPendingOrder(app, branchAId, productId);

    const response = await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(201);

    expect(response.body.status).toBe(OrderStatus.APPROVED);
    await expect(
      prisma.auditLog.count({
        where: { action: 'order.erpnext_enqueue_failed' },
      }),
    ).resolves.toBe(1);
    spy.mockRestore();
    restoreOptionalEnv('ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER', original);
  });

  it('fulfillment queue returns approved orders', async () => {
    const created = await createPendingOrder(app, branchAId, productId);
    await request(app.getHttpServer())
      .post(`/orders/${created.body.id}/approve`)
      .set('x-permissions', 'orders:approve,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/orders/fulfillment/queue')
      .set('x-permissions', 'orders:view,orders:view_branch')
      .set('x-branch-id', branchAId)
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].status).toBe(OrderStatus.APPROVED);
  });
});

function createDraftOrder(
  app: INestApplication,
  branchId: string,
  productId: string,
  quantity: number,
  unitPrice: number,
) {
  return request(app.getHttpServer())
    .post('/orders')
    .set('x-permissions', 'orders:create')
    .set('x-actor-id', 'orders-e2e')
    .send({
      branchId,
      customerName: 'عميل اختبار',
      customerPhone: '+966500000000',
      items: [{ productId, quantity, unitPrice }],
    })
    .expect(201);
}

async function createPendingOrder(
  app: INestApplication,
  branchId: string,
  productId: string,
) {
  const created = await createDraftOrder(app, branchId, productId, 1, 5);
  await request(app.getHttpServer())
    .post(`/orders/${created.body.id}/submit-for-approval`)
    .set('x-permissions', 'orders:submit,orders:view_branch')
    .set('x-branch-id', branchId)
    .expect(201);
  return created;
}

async function deleteOrderTestData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.notification.deleteMany({
    where: { entityType: 'order' },
  });
  await prisma.workOrderItem.deleteMany({
    where: {
      workOrder: { order: { orderNumber: { startsWith: 'ORD-ORD_' } } },
    },
  });
  await prisma.workOrder.deleteMany({
    where: { order: { orderNumber: { startsWith: 'ORD-ORD_' } } },
  });
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.auditLog.deleteMany({
    where: { action: { startsWith: 'order.' } },
  });
  await prisma.product.deleteMany({
    where: { code: { startsWith: 'ORD_PRODUCT_' } },
  });
  await prisma.branch.deleteMany({
    where: { code: { startsWith: 'ORD_' } },
  });
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
