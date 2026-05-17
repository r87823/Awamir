import { PaymentMethod, Prisma } from '@prisma/client';
import { ERPNextConfig } from './erpnext.types';

export class ERPNextSyncValidationError extends Error {
  constructor(
    readonly code:
      | 'validation_failed'
      | 'missing_item_code'
      | 'missing_account',
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

type OrderForERPNext = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

type PaymentForERPNext = Prisma.PaymentGetPayload<{
  include: { order: true };
}>;

export function buildSalesOrderRequest(
  order: OrderForERPNext,
  config: ERPNextConfig,
) {
  const customer = requireCustomer(order.customerId, config);
  const warehouse = requireValue(
    config.defaultWarehouse,
    'missing_account',
    'ERPNEXT_DEFAULT_WAREHOUSE is required',
  );
  const transactionDate = dateKey(order.createdAt);

  return {
    method: 'POST' as const,
    path: '/api/resource/Sales Order',
    body: {
      doctype: 'Sales Order',
      company: config.company,
      customer,
      transaction_date: transactionDate,
      delivery_date: transactionDate,
      po_no: order.orderNumber,
      awamir_order_id: order.id,
      awamir_order_number: order.orderNumber,
      items: order.items.map((item) => ({
        item_code: requireItemCode(item.erpnextItemCode, item.id),
        item_name: item.itemName,
        qty: Number(item.quantity),
        rate: Number(item.unitPrice),
        warehouse,
      })),
    },
  };
}

export function buildDraftSalesInvoiceRequest(
  order: OrderForERPNext,
  config: ERPNextConfig,
) {
  const customer = requireCustomer(order.customerId, config);
  const warehouse = requireValue(
    config.defaultWarehouse,
    'missing_account',
    'ERPNEXT_DEFAULT_WAREHOUSE is required',
  );
  const incomeAccount = requireValue(
    config.incomeAccount,
    'missing_account',
    'ERPNEXT_INCOME_ACCOUNT is required',
  );

  return {
    method: 'POST' as const,
    path: '/api/resource/Sales Invoice',
    body: {
      doctype: 'Sales Invoice',
      docstatus: 0,
      company: config.company,
      customer,
      posting_date: dateKey(new Date()),
      awamir_order_id: order.id,
      awamir_order_number: order.orderNumber,
      items: order.items.map((item) => ({
        item_code: requireItemCode(item.erpnextItemCode, item.id),
        item_name: item.itemName,
        qty: Number(item.quantity),
        rate: Number(item.unitPrice),
        warehouse,
        income_account: incomeAccount,
        sales_order: order.erpnextSalesOrderId ?? undefined,
      })),
    },
  };
}

export function buildDraftPaymentEntryRequest(
  payment: PaymentForERPNext,
  config: ERPNextConfig,
) {
  const customer = requireCustomer(payment.order.customerId, config);
  const paidFrom = requireValue(
    config.receivableAccount,
    'missing_account',
    'ERPNEXT_RECEIVABLE_ACCOUNT is required',
  );
  const paidTo = requireValue(
    accountForMethod(payment.method, config),
    'missing_account',
    `ERPNext account is required for payment method ${payment.method}`,
  );
  const amount = Number(payment.amount);

  return {
    method: 'POST' as const,
    path: '/api/resource/Payment Entry',
    body: {
      doctype: 'Payment Entry',
      docstatus: 0,
      company: config.company,
      payment_type: 'Receive',
      party_type: 'Customer',
      party: customer,
      posting_date: dateKey(payment.collectedAt),
      paid_amount: amount,
      received_amount: amount,
      paid_from: paidFrom,
      paid_to: paidTo,
      reference_no: payment.id,
      reference_date: dateKey(payment.collectedAt),
      awamir_payment_id: payment.id,
      awamir_order_id: payment.orderId,
      references: paymentEntryReferences(payment, amount),
    },
  };
}

function paymentEntryReferences(payment: PaymentForERPNext, amount: number) {
  if (
    !payment.order.erpnextSalesInvoiceId ||
    !['INVOICE_SUBMITTED', 'ACCOUNTING_POSTED'].includes(
      payment.order.accountingStatus,
    )
  ) {
    return [];
  }

  return [
    {
      reference_doctype: 'Sales Invoice',
      reference_name: payment.order.erpnextSalesInvoiceId,
      total_amount: amount,
      outstanding_amount: amount,
      allocated_amount: amount,
    },
  ];
}

export function buildSubmitDocumentRequest(doctype: string, name: string) {
  return {
    method: 'POST' as const,
    path: '/api/method/frappe.client.submit',
    body: {
      doc: {
        doctype,
        name,
      },
    },
  };
}

function requireCustomer(customerId: string | null, config: ERPNextConfig) {
  const customer = customerId || config.defaultCustomer;
  return requireValue(
    customer,
    'validation_failed',
    'ERPNext customer is required',
  );
}

function requireItemCode(value: string, itemId: string) {
  return requireValue(
    value,
    'missing_item_code',
    'ERPNext item code is required',
    { itemId },
  );
}

function requireValue<T extends string>(
  value: T | null | undefined,
  code: ERPNextSyncValidationError['code'],
  message: string,
  details: Record<string, unknown> = {},
) {
  if (!value?.trim()) {
    throw new ERPNextSyncValidationError(code, message, details);
  }
  return value;
}

function accountForMethod(method: PaymentMethod, config: ERPNextConfig) {
  if (method === 'CASH') return config.cashAccount;
  if (method === 'CARD') return config.cardAccount;
  if (method === 'TRANSFER') return config.transferAccount;
  if (method === 'ONLINE') return config.onlineAccount;
  return config.creditAccount;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
