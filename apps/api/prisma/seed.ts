import { PrismaClient } from '@prisma/client';

export const seedBranches = [
  { code: 'RIYADH', nameAr: 'فرع الرياض', nameEn: 'Riyadh Branch' },
  { code: 'JEDDAH', nameAr: 'فرع جدة', nameEn: 'Jeddah Branch' },
  { code: 'DAMMAM', nameAr: 'فرع الدمام', nameEn: 'Dammam Branch' },
];

export const seedDepartments = [
  { code: 'BAKERY', nameAr: 'المخبوزات', nameEn: 'Bakery' },
  { code: 'HOT_KITCHEN', nameAr: 'المطبخ الساخن', nameEn: 'Hot Kitchen' },
  { code: 'COLD_KITCHEN', nameAr: 'المطبخ البارد', nameEn: 'Cold Kitchen' },
  { code: 'PACKING', nameAr: 'التغليف', nameEn: 'Packing' },
  { code: 'DELIVERY', nameAr: 'التوصيل', nameEn: 'Delivery' },
];

export const seedProducts = [
  {
    code: 'SAMBOSA_CHEESE',
    nameAr: 'سمبوسة جبن',
    nameEn: 'Cheese Sambosa',
    erpnextItemCode: 'ERP-SAMBOSA-CHEESE',
    itemGroup: 'Prepared Food',
    stockUom: 'Nos',
  },
  {
    code: 'FATAYER_SPINACH',
    nameAr: 'فطائر سبانخ',
    nameEn: 'Spinach Fatayer',
    erpnextItemCode: 'ERP-FATAYER-SPINACH',
    itemGroup: 'Bakery',
    stockUom: 'Nos',
  },
];

export async function seedMasterData(prisma: PrismaClient) {
  for (const branch of seedBranches) {
    const createdBranch = await prisma.branch.upsert({
      where: { code: branch.code },
      update: { ...branch, isActive: true, deletedAt: null },
      create: branch,
    });

    await prisma.productionCenter.upsert({
      where: {
        branchId_code: {
          branchId: createdBranch.id,
          code: `${branch.code}_MAIN_KITCHEN`,
        },
      },
      update: {
        nameAr: `مركز إنتاج ${branch.nameAr.replace('فرع ', '')}`,
        nameEn: `${branch.nameEn.replace(' Branch', '')} Main Kitchen`,
        isActive: true,
        deletedAt: null,
      },
      create: {
        branchId: createdBranch.id,
        code: `${branch.code}_MAIN_KITCHEN`,
        nameAr: `مركز إنتاج ${branch.nameAr.replace('فرع ', '')}`,
        nameEn: `${branch.nameEn.replace(' Branch', '')} Main Kitchen`,
      },
    });
  }

  for (const department of seedDepartments) {
    await prisma.department.upsert({
      where: { code: department.code },
      update: { ...department, isActive: true, deletedAt: null },
      create: department,
    });
  }

  for (const product of seedProducts) {
    await prisma.product.upsert({
      where: { code: product.code },
      update: { ...product, isActive: true, deletedAt: null },
      create: product,
    });
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    await seedMasterData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
