import { ERPNextSyncOperation } from '@prisma/client';

export type ERPNextConfig = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
  company: string;
  timeoutMs: number;
  defaultCustomer?: string;
  defaultWarehouse?: string;
  receivableAccount?: string;
  incomeAccount?: string;
  cashAccount?: string;
  cardAccount?: string;
  transferAccount?: string;
  onlineAccount?: string;
  creditAccount?: string;
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
  durationMs?: number;
  errorCode?: ERPNextSyncErrorCode;
  errorMessage?: string;
};

export type PlaceholderSyncContract = {
  operation: ERPNextSyncOperation;
  sourceType: 'order' | 'payment';
  sourceId: string;
  idempotencyKey: string;
  erpnextDoctype: string;
  body: Record<string, unknown>;
};

export type ERPNextSyncErrorCode =
  | 'validation_failed'
  | 'connection_failed'
  | 'duplicate_document'
  | 'missing_item_code'
  | 'missing_account'
  | 'timeout';

export type ERPNextPreparedRequest = {
  method: 'POST';
  path: string;
  body: Record<string, unknown>;
  requestPayload: Record<string, unknown>;
};
