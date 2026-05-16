import { AdminSettingDefinition } from './admin.types';

export const adminSettingRegistry: AdminSettingDefinition[] = [
  dbBoolean('ENABLE_PACKING_STAGE', false),
  dbBoolean('ALLOW_DEPARTMENT_OVERRIDE', false),
  dbBoolean('ALLOW_PARTIAL_DELIVERY', false),
  dbBoolean('AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION', false),
  dbBoolean('ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER', false),
  dbBoolean('ACCOUNTING_REQUIRE_REVIEW_BEFORE_SYNC', true),
  dbBoolean('ACCOUNTING_SUBMIT_INVOICE_ON_SYNC', false),
  dbBoolean('ACCOUNTING_SUBMIT_PAYMENT_ON_SYNC', false),
  dbBoolean('ACCOUNTING_ALLOW_CLOSE_WITH_PENDING_CASHBOXES', false),
  dbBoolean('ALLOW_CASHBOX_CLOSE_WITH_PENDING', false),
  {
    key: 'ACCOUNTING_INVOICE_TRIGGER',
    valueType: 'STRING',
    isSecret: false,
    isMutable: true,
    defaultValue: 'READY',
    source: 'db',
  },
  envString('ERPNEXT_BASE_URL', false),
  envString('ERPNEXT_COMPANY', false),
  envString('ERPNEXT_API_KEY', true),
  envString('ERPNEXT_API_SECRET', true),
];

export function settingDefinition(key: string) {
  return adminSettingRegistry.find((setting) => setting.key === key);
}

function dbBoolean(key: string, defaultValue: boolean): AdminSettingDefinition {
  return {
    key,
    valueType: 'BOOLEAN',
    isSecret: false,
    isMutable: true,
    defaultValue,
    source: 'db',
  };
}

function envString(key: string, isSecret: boolean): AdminSettingDefinition {
  return {
    key,
    valueType: 'STRING',
    isSecret,
    isMutable: false,
    source: 'env',
  };
}
