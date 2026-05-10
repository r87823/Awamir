import {
  seedBranches,
  seedDepartments,
  seedProducts,
  seedRoles,
  seedUsers,
} from './seed';

describe('seed data', () => {
  it('defines required Arabic branch and department master data', () => {
    expect(seedBranches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'RIYADH', nameAr: 'فرع الرياض' }),
        expect.objectContaining({ code: 'JEDDAH', nameAr: 'فرع جدة' }),
        expect.objectContaining({ code: 'DAMMAM', nameAr: 'فرع الدمام' }),
      ]),
    );
    expect(seedDepartments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'BAKERY', nameAr: 'المخبوزات' }),
        expect.objectContaining({
          code: 'HOT_KITCHEN',
          nameAr: 'المطبخ الساخن',
        }),
        expect.objectContaining({ code: 'PACKING', nameAr: 'التغليف' }),
      ]),
    );
  });

  it('defines products as local ERPNext item cache records', () => {
    expect(seedProducts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'SAMBOSA_CHEESE',
          erpnextItemCode: 'ERP-SAMBOSA-CHEESE',
        }),
      ]),
    );
  });

  it('defines required demo users as seed data', () => {
    expect(seedUsers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ username: 'operator' }),
        expect.objectContaining({ username: 'supervisor' }),
        expect.objectContaining({ username: 'fulfillment' }),
        expect.objectContaining({ username: 'production' }),
        expect.objectContaining({ username: 'driver' }),
        expect.objectContaining({ username: 'cashier' }),
        expect.objectContaining({ username: 'accountant' }),
        expect.objectContaining({ username: 'admin' }),
      ]),
    );
    expect(seedRoles.PLATFORM_ADMIN).toEqual(
      expect.objectContaining({ nameAr: 'مدير النظام' }),
    );
  });
});
