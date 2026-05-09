import { seedBranches, seedDepartments, seedProducts } from './seed';

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
});
