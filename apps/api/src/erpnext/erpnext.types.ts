import { ERPNextSyncOperation } from '@prisma/client';

export type ERPNextConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

export type ERPNextRequest = {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export type ERPNextResponse = {
  status: number;
  ok: boolean;
  body: unknown;
};

export type PlaceholderSyncContract = {
  operation: ERPNextSyncOperation;
  sourceType: 'order' | 'payment';
  sourceId: string;
  idempotencyKey: string;
  erpnextDoctype: string;
  body: Record<string, unknown>;
};
