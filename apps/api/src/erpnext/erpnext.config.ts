import { Injectable } from '@nestjs/common';
import { ERPNextConfig } from './erpnext.types';

@Injectable()
export class ERPNextConfigService {
  getConfig(): ERPNextConfig {
    const strict = isStrictEnvironment();
    return {
      baseUrl: envValue('ERPNEXT_BASE_URL', strict) ?? 'http://127.0.0.1:0',
      apiKey: envValue('ERPNEXT_API_KEY', strict) ?? 'dev-key',
      apiSecret: envValue('ERPNEXT_API_SECRET', strict) ?? 'dev-secret',
      company: envValue('ERPNEXT_COMPANY', strict) ?? 'Awamir Plus',
      timeoutMs: Number(process.env.ERPNEXT_TIMEOUT_MS ?? 5000),
      defaultCustomer: process.env.ERPNEXT_DEFAULT_CUSTOMER,
      defaultWarehouse: process.env.ERPNEXT_DEFAULT_WAREHOUSE,
      receivableAccount: process.env.ERPNEXT_RECEIVABLE_ACCOUNT,
      incomeAccount: process.env.ERPNEXT_INCOME_ACCOUNT,
      cashAccount: process.env.ERPNEXT_CASH_ACCOUNT,
      cardAccount: process.env.ERPNEXT_CARD_ACCOUNT,
      transferAccount: process.env.ERPNEXT_TRANSFER_ACCOUNT,
      onlineAccount: process.env.ERPNEXT_ONLINE_ACCOUNT,
      creditAccount: process.env.ERPNEXT_CREDIT_ACCOUNT,
    };
  }

  validateRequiredForSync() {
    const config = this.getConfig();
    const missing = [
      ['ERPNEXT_BASE_URL', config.baseUrl],
      ['ERPNEXT_API_KEY', config.apiKey],
      ['ERPNEXT_API_SECRET', config.apiSecret],
      ['ERPNEXT_COMPANY', config.company],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(`Missing ERPNext config: ${missing.join(', ')}`);
    }

    return config;
  }
}

function envValue(name: string, strict: boolean): string | undefined {
  const value = process.env[name];
  if (!value && strict) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function isStrictEnvironment() {
  return ['staging', 'production'].includes(
    (process.env.NODE_ENV ?? '').toLowerCase(),
  );
}
