import { Injectable } from '@nestjs/common';
import { ERPNextConfig } from './erpnext.types';

@Injectable()
export class ERPNextConfigService {
  getConfig(): ERPNextConfig {
    return {
      baseUrl: requiredEnv('ERPNEXT_BASE_URL'),
      apiKey: requiredEnv('ERPNEXT_API_KEY'),
      apiSecret: requiredEnv('ERPNEXT_API_SECRET'),
    };
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
