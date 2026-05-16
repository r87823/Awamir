import 'dotenv/config';
import {
  DeliveryStatus,
  ERPNextSyncOperation,
  ERPNextSyncStatus,
  PaymentMethod,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

type LoginResponse = {
  token: string;
  user: {
    actorId?: string;
    branchId?: string;
    permissions?: string[];
  };
};

type OrderResponse = {
  id: string;
  orderNumber: string;
  status?: string;
  deliveryStatus?: DeliveryStatus;
  erpnextSalesOrderId?: string | null;
  erpnextSalesInvoiceId?: string | null;
};

type PaymentResponse = {
  id: string;
  orderId: string;
  amount?: string | number;
  erpnextPaymentEntryId?: string | null;
};

type SyncResponse = {
  outbox?: { id: string };
  submitOutbox?: { id: string } | null;
};

type OutboxWithLogs = Awaited<ReturnType<typeof readOutboxWithLogs>>;

const requiredBackendEnv = ['DATABASE_URL'];
const requiredApiEnv = ['AWAMIR_API_BASE_URL'];
const requiredERPNextEnv = [
  'ERPNEXT_BASE_URL',
  'ERPNEXT_API_KEY',
  'ERPNEXT_API_SECRET',
  'ERPNEXT_COMPANY',
];

async function main() {
  const missing = missingEnv([...requiredBackendEnv, ...requiredApiEnv]);
  if (missing.length > 0) {
    printMissingEnv(missing);
    process.exitCode = 2;
    return;
  }

  const missingERPNext = missingEnv(requiredERPNextEnv);
  if (missingERPNext.length > 0) {
    console.warn(
      `ERPNext env is not fully present in this process: ${missingERPNext.join(
        ', ',
      )}`,
    );
    console.warn(
      'The backend may still be configured remotely; this script will verify through the backend endpoint without printing secrets.',
    );
  }

  const apiBaseUrl = requireEnv('AWAMIR_API_BASE_URL').replace(/\/+$/, '');
  const username = process.env.AWAMIR_VERIFY_USERNAME ?? 'admin';
  const password = process.env.AWAMIR_VERIFY_PASSWORD ?? 'demo';
  const branchCode = process.env.AWAMIR_VERIFY_BRANCH_CODE ?? 'RIYADH';
  const productCode =
    process.env.AWAMIR_VERIFY_PRODUCT_CODE ?? 'FATAYER_SPINACH';
  const paymentMethod = parsePaymentMethod(
    process.env.AWAMIR_VERIFY_PAYMENT_METHOD ?? 'CASH',
  );
  const runId = randomUUID();

  console.log('R19-T02 ERPNext staging verification');
  console.log(`API: ${apiBaseUrl}`);
  console.log(
    `Inputs: user=${username}, branchCode=${branchCode}, productCode=${productCode}, paymentMethod=${paymentMethod}`,
  );
  console.log('Secrets: redacted');

  const login = await request<LoginResponse>(apiBaseUrl, '/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  const token = login.token;
  console.log(`Authenticated actor: ${login.user.actorId ?? 'unknown'}`);

  const validation = await request<unknown>(
    apiBaseUrl,
    '/erpnext/validate-connection',
    {
      method: 'POST',
      token,
    },
  );
  console.log(`validate-connection: ${JSON.stringify(validation)}`);

  const branch = await prisma.branch.findUnique({
    where: { code: branchCode },
    select: { id: true, code: true },
  });
  if (!branch) throw new Error(`Branch not found for code ${branchCode}`);

  const product = await prisma.product.findUnique({
    where: { code: productCode },
    select: {
      id: true,
      code: true,
      erpnextItemCode: true,
      nameAr: true,
      nameEn: true,
    },
  });
  if (!product) throw new Error(`Product not found for code ${productCode}`);
  if (!product.erpnextItemCode) {
    throw new Error(`Product ${productCode} has no erpnextItemCode`);
  }

  const customerName = `R19 ERPNext Smoke ${runId.slice(0, 8)}`;
  const order = await request<OrderResponse>(apiBaseUrl, '/orders', {
    method: 'POST',
    token,
    body: {
      branchId: branch.id,
      customerName,
      items: [{ productId: product.id, quantity: 1, unitPrice: 10 }],
    },
  });
  console.log(`Created draft order: ${order.orderNumber} (${order.id})`);

  await request<OrderResponse>(
    apiBaseUrl,
    `/orders/${order.id}/submit-for-approval`,
    { method: 'POST', token },
  );
  await request<OrderResponse>(apiBaseUrl, `/orders/${order.id}/approve`, {
    method: 'POST',
    token,
  });
  console.log('Order submitted and approved through backend API');

  await request<OrderResponse>(
    apiBaseUrl,
    `/accounting/orders/${order.id}/review-sales-order`,
    { method: 'POST', token },
  );
  const salesOrderSync = await request<SyncResponse>(
    apiBaseUrl,
    `/accounting/orders/${order.id}/sync-sales-order`,
    { method: 'POST', token },
  );
  const salesOrderOutbox = await waitForOutbox(
    salesOrderSync.outbox?.id,
    ERPNextSyncOperation.CREATE_SALES_ORDER,
  );
  await assertSucceeded(salesOrderOutbox, 'Sales Order');

  await prepareInvoiceEligibility(order.id);
  await request<OrderResponse>(
    apiBaseUrl,
    `/accounting/orders/${order.id}/review-invoice`,
    { method: 'POST', token },
  );
  const invoiceSync = await request<SyncResponse>(
    apiBaseUrl,
    `/accounting/orders/${order.id}/sync-invoice`,
    { method: 'POST', token },
  );
  const invoiceOutbox = await waitForOutbox(
    invoiceSync.outbox?.id,
    ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE,
  );
  await assertSucceeded(invoiceOutbox, 'Draft Sales Invoice');

  const payment = await request<PaymentResponse>(
    apiBaseUrl,
    '/payments/branch',
    {
      method: 'POST',
      token,
      body: {
        orderId: order.id,
        amount: 10,
        method: paymentMethod,
        idempotencyKey: `r19-t02-payment:${runId}`,
        notes: 'R19-T02 ERPNext staging verification payment',
      },
    },
  );
  console.log(`Collected payment: ${payment.id}`);

  await request<PaymentResponse>(
    apiBaseUrl,
    `/accounting/payments/${payment.id}/review`,
    { method: 'POST', token },
  );
  const paymentSync = await request<SyncResponse>(
    apiBaseUrl,
    `/accounting/payments/${payment.id}/sync`,
    { method: 'POST', token },
  );
  const paymentOutbox = await waitForOutbox(
    paymentSync.outbox?.id,
    ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY,
  );
  await assertSucceeded(paymentOutbox, 'Payment Entry');

  const storedOrder = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    select: {
      id: true,
      orderNumber: true,
      erpnextSalesOrderId: true,
      erpnextSalesInvoiceId: true,
      accountingStatus: true,
    },
  });
  const storedPayment = await prisma.payment.findUniqueOrThrow({
    where: { id: payment.id },
    select: {
      id: true,
      erpnextPaymentEntryId: true,
      status: true,
    },
  });

  console.log('ERPNext references stored in Awamir:');
  console.log(`- order: ${storedOrder.orderNumber}`);
  console.log(
    `- order.erpnextSalesOrderId: ${storedOrder.erpnextSalesOrderId}`,
  );
  console.log(
    `- order.erpnextSalesInvoiceId: ${storedOrder.erpnextSalesInvoiceId}`,
  );
  console.log(
    `- payment.erpnextPaymentEntryId: ${storedPayment.erpnextPaymentEntryId}`,
  );
  console.log(`- order.accountingStatus: ${storedOrder.accountingStatus}`);
  console.log(`- payment.status: ${storedPayment.status}`);

  console.log('R19-T02 real ERPNext staging verification completed.');
}

async function prepareInvoiceEligibility(orderId: string) {
  const current = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { deliveryStatus: true },
  });
  if (invoiceEligible(current.deliveryStatus)) {
    return;
  }

  if (process.env.AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP !== 'true') {
    throw new Error(
      `Order deliveryStatus=${current.deliveryStatus}; set AWAMIR_VERIFY_ALLOW_STAGING_STATE_PREP=true for the staging smoke shortcut or run the fulfillment/packing flow first.`,
    );
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryStatus: 'WAITING_BATCH' },
  });
  console.log(
    'Prepared staging order for invoice eligibility: deliveryStatus=WAITING_BATCH',
  );
}

function invoiceEligible(status: DeliveryStatus) {
  return [
    'READY',
    'WAITING_BATCH',
    'ADDED_TO_DELIVERY_BATCH',
    'DELIVERED',
  ].includes(status);
}

async function waitForOutbox(
  outboxId: string | undefined,
  operation: ERPNextSyncOperation,
) {
  if (!outboxId) {
    throw new Error(
      `Accounting endpoint did not return outbox id for ${operation}`,
    );
  }

  const timeoutMs = Number(process.env.AWAMIR_VERIFY_TIMEOUT_MS ?? 120000);
  const pollMs = Number(process.env.AWAMIR_VERIFY_POLL_MS ?? 2500);
  const deadline = Date.now() + timeoutMs;
  let last: OutboxWithLogs | null = null;

  while (Date.now() < deadline) {
    last = await readOutboxWithLogs(outboxId);
    printOutboxStatus(last);
    if (
      last.status === ERPNextSyncStatus.SUCCEEDED ||
      last.status === ERPNextSyncStatus.FAILED ||
      last.status === ERPNextSyncStatus.DEAD_LETTER
    ) {
      return last;
    }
    await sleep(pollMs);
  }

  throw new Error(
    `Timed out waiting for ${operation} outbox ${outboxId}. Last status: ${
      last?.status ?? 'unknown'
    }`,
  );
}

async function readOutboxWithLogs(outboxId: string) {
  const outbox = await prisma.integrationOutbox.findUniqueOrThrow({
    where: { id: outboxId },
    include: {
      logs: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });
  return outbox;
}

async function assertSucceeded(outbox: OutboxWithLogs, label: string) {
  if (outbox.status === ERPNextSyncStatus.SUCCEEDED) {
    console.log(
      `${label} synced: ${outbox.erpnextName ?? '(no name returned)'}`,
    );
    return;
  }

  console.error(`${label} sync did not succeed.`);
  printOutboxDetails(outbox);
  throw new Error(`${label} sync failed with status ${outbox.status}`);
}

function printOutboxStatus(outbox: OutboxWithLogs) {
  console.log(
    `outbox ${outbox.operation}: status=${outbox.status}, retryCount=${outbox.retryCount}, erpnextName=${
      outbox.erpnextName ?? ''
    }, lastError=${outbox.lastError ?? ''}`,
  );
}

function printOutboxDetails(outbox: OutboxWithLogs) {
  printOutboxStatus(outbox);
  for (const log of outbox.logs) {
    console.error(
      `syncLog: status=${log.status}, errorCode=${
        log.errorCode ?? ''
      }, errorMessage=${log.errorMessage ?? ''}`,
    );
  }
}

async function request<T>(
  apiBaseUrl: string,
  path: string,
  input: {
    method: 'GET' | 'POST';
    token?: string;
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: input.method,
    headers: {
      'Content-Type': 'application/json',
      ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  const text = await response.text();
  const body = text ? parseJson(text) : null;
  if (!response.ok) {
    throw new Error(
      `API ${input.method} ${path} failed with ${response.status}: ${safeJson(
        body,
      )}`,
    );
  }
  return body as T;
}

function parseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function safeJson(value: unknown) {
  return JSON.stringify(redact(value));
}

function redact(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/secret|token|password|authorization|api[_-]?key/i.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = redact(nested);
    }
  }
  return output;
}

function missingEnv(names: string[]) {
  return names.filter((name) => !process.env[name]?.trim());
}

function printMissingEnv(names: string[]) {
  console.error(`Missing required env: ${names.join(', ')}`);
  console.error(
    'Copy .env.staging.example to an untracked env file or run inside the configured staging API container.',
  );
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value;
}

function parsePaymentMethod(value: string): PaymentMethod {
  const normalized = value.toUpperCase();
  if (
    normalized === 'CASH' ||
    normalized === 'CARD' ||
    normalized === 'TRANSFER' ||
    normalized === 'ONLINE' ||
    normalized === 'CREDIT'
  ) {
    return normalized;
  }
  throw new Error(`Unsupported AWAMIR_VERIFY_PAYMENT_METHOD=${value}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
