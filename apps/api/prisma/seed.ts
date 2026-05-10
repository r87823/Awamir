import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  AuthRoleCode,
  allOperationalPermissions,
  rolePermissionMap,
} from '../src/auth/auth-permissions';

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

export const seedRoles: Record<AuthRoleCode, { nameAr: string; nameEn: string }> = {
  BRANCH_OPERATOR: { nameAr: 'مشغل الفرع', nameEn: 'Branch Operator' },
  BRANCH_SUPERVISOR: { nameAr: 'مشرف الفرع', nameEn: 'Branch Supervisor' },
  FULFILLMENT_COORDINATOR: {
    nameAr: 'منسق التجهيز',
    nameEn: 'Fulfillment Coordinator',
  },
  PRODUCTION_OPERATOR: { nameAr: 'مشغل الإنتاج', nameEn: 'Production Operator' },
  DRIVER: { nameAr: 'السائق', nameEn: 'Driver' },
  CASHIER: { nameAr: 'أمين الصندوق', nameEn: 'Cashier' },
  ACCOUNTANT: { nameAr: 'المحاسب', nameEn: 'Accountant' },
  PLATFORM_ADMIN: { nameAr: 'مدير النظام', nameEn: 'Platform Admin' },
};

export const seedUsers: Array<{
  username: string;
  displayName: string;
  roleCode: AuthRoleCode;
  branchCodes?: string[];
  departmentCodes?: string[];
  driverId?: string;
  isActive?: boolean;
}> = [
  {
    username: 'operator',
    displayName: 'مشغل الفرع',
    roleCode: 'BRANCH_OPERATOR',
    branchCodes: ['RIYADH'],
  },
  {
    username: 'supervisor',
    displayName: 'مشرف الفرع',
    roleCode: 'BRANCH_SUPERVISOR',
    branchCodes: ['RIYADH'],
  },
  {
    username: 'fulfillment',
    displayName: 'منسق التجهيز',
    roleCode: 'FULFILLMENT_COORDINATOR',
    branchCodes: ['RIYADH'],
  },
  {
    username: 'production',
    displayName: 'مشغل الإنتاج',
    roleCode: 'PRODUCTION_OPERATOR',
    branchCodes: ['RIYADH'],
    departmentCodes: ['BAKERY', 'HOT_KITCHEN', 'COLD_KITCHEN', 'PACKING'],
  },
  {
    username: 'driver',
    displayName: 'السائق',
    roleCode: 'DRIVER',
    branchCodes: ['RIYADH'],
    driverId: 'driver-demo',
  },
  {
    username: 'cashier',
    displayName: 'أمين الصندوق',
    roleCode: 'CASHIER',
    branchCodes: ['RIYADH'],
  },
  {
    username: 'accountant',
    displayName: 'المحاسب',
    roleCode: 'ACCOUNTANT',
  },
  {
    username: 'admin',
    displayName: 'مدير النظام',
    roleCode: 'PLATFORM_ADMIN',
    branchCodes: ['RIYADH'],
    departmentCodes: ['BAKERY', 'HOT_KITCHEN', 'COLD_KITCHEN', 'PACKING'],
  },
  {
    username: 'inactive',
    displayName: 'مستخدم غير مفعل',
    roleCode: 'BRANCH_OPERATOR',
    branchCodes: ['RIYADH'],
    isActive: false,
  },
];

export async function seedAuthData(prisma: PrismaClient) {
  const permissions = new Map<string, { id: string }>();
  for (const permission of allOperationalPermissions) {
    const row = await prisma.permission.upsert({
      where: { code: permission },
      update: {},
      create: {
        code: permission,
        description: `Allows ${permission}`,
      },
      select: { id: true, code: true },
    });
    permissions.set(row.code, row);
  }

  const roles = new Map<AuthRoleCode, { id: string }>();
  for (const [code, names] of Object.entries(seedRoles) as Array<
    [AuthRoleCode, (typeof seedRoles)[AuthRoleCode]]
  >) {
    const role = await prisma.role.upsert({
      where: { code },
      update: { ...names, isActive: true, deletedAt: null },
      create: { code, ...names },
      select: { id: true, code: true },
    });
    roles.set(code, role);

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permissionCode of rolePermissionMap[code]) {
      const permission = permissions.get(permissionCode);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  const passwordHash = await bcrypt.hash('demo', 12);
  for (const seedUser of seedUsers) {
    const user = await prisma.user.upsert({
      where: { username: seedUser.username },
      update: {
        displayName: seedUser.displayName,
        passwordHash,
        isActive: seedUser.isActive ?? true,
        driverId: seedUser.driverId ?? null,
        deletedAt: null,
      },
      create: {
        username: seedUser.username,
        displayName: seedUser.displayName,
        passwordHash,
        isActive: seedUser.isActive ?? true,
        driverId: seedUser.driverId,
      },
      select: { id: true },
    });

    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    await prisma.userBranchAccess.deleteMany({ where: { userId: user.id } });
    await prisma.userDepartmentAccess.deleteMany({ where: { userId: user.id } });

    const role = roles.get(seedUser.roleCode);
    if (role) {
      await prisma.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });
    }

    for (const branchCode of seedUser.branchCodes ?? []) {
      const branch = await prisma.branch.findUnique({
        where: { code: branchCode },
        select: { id: true },
      });
      if (!branch) continue;
      await prisma.userBranchAccess.create({
        data: { userId: user.id, branchId: branch.id },
      });
    }

    for (const departmentCode of seedUser.departmentCodes ?? []) {
      const department = await prisma.department.findUnique({
        where: { code: departmentCode },
        select: { id: true },
      });
      if (!department) continue;
      await prisma.userDepartmentAccess.create({
        data: { userId: user.id, departmentId: department.id },
      });
    }
  }
}

async function main() {
  const prisma = new PrismaClient();

  try {
    await seedMasterData(prisma);
    await seedAuthData(prisma);
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
