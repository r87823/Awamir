import { BadRequestException, Injectable } from '@nestjs/common';
import { LoginDto, LoginResponse, MvpSessionUser } from './auth.types';

const allOperationalPermissions = [
  'orders:view',
  'orders:view_branch',
  'orders:create',
  'orders:update',
  'orders:submit',
  'orders:approve',
  'orders:reject',
  'orders:return_for_edit',
  'fulfillment_coordinator',
  'fulfillment:split',
  'production_operator',
  'packing:pack',
  'delivery:batch_create',
  'delivery:assign_driver',
  'delivery_driver',
  'payment.collect_branch',
  'payment.collect_delivery',
  'payment.view_own',
  'payment.view_all',
  'cashbox.view_own',
  'cashbox.view_all',
  'cashbox.submit',
  'cashbox.review',
  'cashbox.approve',
  'cashbox.return',
  'cashbox.close_day',
  'accounting.view_financials',
  'accounting.review_sales_order',
  'accounting.submit_sales_order',
  'accounting.review_invoice',
  'accounting.submit_invoice',
  'accounting.review_payment',
  'accounting.submit_payment',
  'accounting.reconcile_payments',
  'accounting.close_financial_day',
  'erpnext.view_sync_logs',
  'erpnext.retry_sync',
  'master-data:manage',
  'notifications:view',
  'notifications:read',
];

const users: Record<string, MvpSessionUser> = {
  operator: {
    actorId: 'mvp-operator',
    branchId: process.env.MVP_BRANCH_ID,
    departmentIds: [],
    displayName: 'مشغل الفرع',
    permissions: [
      'orders:view',
      'orders:view_branch',
      'orders:create',
      'orders:update',
      'orders:submit',
      'payment.collect_branch',
      'payment.view_own',
      'cashbox.view_own',
      'cashbox.submit',
      'notifications:view',
      'notifications:read',
    ],
  },
  supervisor: {
    actorId: 'mvp-supervisor',
    branchId: process.env.MVP_BRANCH_ID,
    departmentIds: [],
    displayName: 'مشرف الفرع',
    permissions: [
      'orders:view',
      'orders:view_branch',
      'orders:approve',
      'orders:reject',
      'orders:return_for_edit',
      'notifications:view',
      'notifications:read',
    ],
  },
  production: {
    actorId: 'mvp-production',
    branchId: process.env.MVP_BRANCH_ID,
    departmentIds: optionalCsv(process.env.MVP_DEPARTMENT_IDS),
    displayName: 'مشغل الإنتاج',
    permissions: ['production_operator'],
  },
  driver: {
    actorId: 'mvp-driver-actor',
    driverId: 'mvp-driver',
    departmentIds: [],
    displayName: 'السائق',
    permissions: [
      'delivery_driver',
      'payment.collect_delivery',
      'payment.view_own',
      'notifications:view',
      'notifications:read',
    ],
  },
  accountant: {
    actorId: 'mvp-accountant',
    departmentIds: [],
    displayName: 'المحاسب',
    permissions: [
      'accounting.view_financials',
      'notifications:view',
      'notifications:read',
    ],
  },
  admin: {
    actorId: 'mvp-admin',
    branchId: process.env.MVP_BRANCH_ID,
    departmentIds: optionalCsv(process.env.MVP_DEPARTMENT_IDS),
    displayName: 'مدير النظام',
    permissions: allOperationalPermissions,
  },
};

@Injectable()
export class AuthService {
  login(input: LoginDto): LoginResponse {
    const username = input.username?.trim().toLowerCase();
    if (!username || !users[username]) {
      throw new BadRequestException({
        code: 'INVALID_LOGIN',
        message: 'Invalid username or password',
      });
    }

    return {
      token: `mvp-session:${username}`,
      user: users[username],
    };
  }
}

function optionalCsv(value: string | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
