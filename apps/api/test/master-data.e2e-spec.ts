import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Master data foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await deleteE2EData(prisma);
  });

  afterEach(async () => {
    await deleteE2EData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires admin permission for master data CRUD', async () => {
    await request(app.getHttpServer()).get('/admin/departments').expect(403);
  });

  it('lets an admin map a product to a department', async () => {
    const product = await prisma.product.create({
      data: {
        code: 'E2E_PRODUCT',
        nameAr: 'منتج اختبار',
        nameEn: 'E2E Product',
        erpnextItemCode: 'ERP-E2E-PRODUCT',
      },
    });
    const department = await prisma.department.create({
      data: {
        code: 'E2E_DEPARTMENT',
        nameAr: 'قسم اختبار',
        nameEn: 'E2E Department',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/admin/item-department-mappings')
      .set('x-permissions', 'master-data:manage')
      .set('x-actor-id', 'e2e-admin')
      .send({ productId: product.id, departmentId: department.id })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        productId: product.id,
        departmentId: department.id,
        isActive: true,
      }),
    );
    await expect(prisma.auditLog.count()).resolves.toBe(1);
  });

  it('lets order creators list active mapped products for Flutter order entry', async () => {
    const product = await prisma.product.create({
      data: {
        code: 'E2E_PRODUCT',
        nameAr: 'منتج اختبار',
        nameEn: 'E2E Product',
        erpnextItemCode: 'ERP-E2E-PRODUCT',
      },
    });
    const unmapped = await prisma.product.create({
      data: {
        code: 'UNMAPPED_PRODUCT',
        nameAr: 'منتج بلا ربط',
        nameEn: 'Unmapped Product',
        erpnextItemCode: 'ERP-UNMAPPED-PRODUCT',
      },
    });
    const department = await prisma.department.create({
      data: {
        code: 'E2E_DEPARTMENT',
        nameAr: 'قسم اختبار',
        nameEn: 'E2E Department',
      },
    });
    await prisma.itemDepartmentMapping.create({
      data: { productId: product.id, departmentId: department.id },
    });

    const forbidden = await request(app.getHttpServer())
      .get('/products/active')
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');

    const response = await request(app.getHttpServer())
      .get('/products/active')
      .set('x-permissions', 'orders:create')
      .expect(200);

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: product.id,
          code: product.code,
          erpnextItemCode: product.erpnextItemCode,
        }),
      ]),
    );
    expect(response.body.data).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: unmapped.id })]),
    );
  });

  it('returns MISSING_DEPARTMENT_MAPPING when a split item has no mapping', async () => {
    const product = await prisma.product.create({
      data: {
        code: 'UNMAPPED_PRODUCT',
        nameAr: 'منتج بلا ربط',
        nameEn: 'Unmapped Product',
        erpnextItemCode: 'ERP-UNMAPPED-PRODUCT',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/fulfillment/splits/validate')
      .set('x-permissions', 'fulfillment:split')
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'MISSING_DEPARTMENT_MAPPING',
      }),
    );
  });
});

async function deleteE2EData(prisma: PrismaService) {
  await prisma.auditLog.deleteMany();
  await prisma.itemDepartmentMapping.deleteMany();
  await prisma.product.deleteMany({
    where: { code: { in: ['E2E_PRODUCT', 'UNMAPPED_PRODUCT'] } },
  });
  await prisma.department.deleteMany({
    where: { code: 'E2E_DEPARTMENT' },
  });
}
