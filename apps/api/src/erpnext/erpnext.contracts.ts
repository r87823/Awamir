import { ERPNextSyncOperation } from '@prisma/client';
import { PlaceholderSyncContract } from './erpnext.types';

export function salesOrderContract(orderId: string): PlaceholderSyncContract {
  return {
    operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
    sourceType: 'order',
    sourceId: orderId,
    idempotencyKey: `erpnext:sales_order:${orderId}`,
    erpnextDoctype: 'Sales Order',
    body: placeholderBody('Sales Order', orderId),
  };
}

export function draftSalesInvoiceContract(
  orderId: string,
): PlaceholderSyncContract {
  return {
    operation: ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE,
    sourceType: 'order',
    sourceId: orderId,
    idempotencyKey: `erpnext:draft_sales_invoice:${orderId}`,
    erpnextDoctype: 'Sales Invoice',
    body: placeholderBody('Sales Invoice', orderId, { docstatus: 0 }),
  };
}

export function submitSalesInvoiceContract(
  orderId: string,
): PlaceholderSyncContract {
  return {
    operation: ERPNextSyncOperation.SUBMIT_SALES_INVOICE,
    sourceType: 'order',
    sourceId: orderId,
    idempotencyKey: `erpnext:submit_sales_invoice:${orderId}`,
    erpnextDoctype: 'Sales Invoice',
    body: placeholderBody('Sales Invoice Submit', orderId, { submit: true }),
  };
}

export function draftPaymentEntryContract(
  paymentId: string,
): PlaceholderSyncContract {
  return {
    operation: ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY,
    sourceType: 'payment',
    sourceId: paymentId,
    idempotencyKey: `erpnext:draft_payment_entry:${paymentId}`,
    erpnextDoctype: 'Payment Entry',
    body: placeholderBody('Payment Entry', paymentId, { docstatus: 0 }),
  };
}

export function submitPaymentEntryContract(
  paymentId: string,
): PlaceholderSyncContract {
  return {
    operation: ERPNextSyncOperation.SUBMIT_PAYMENT_ENTRY,
    sourceType: 'payment',
    sourceId: paymentId,
    idempotencyKey: `erpnext:submit_payment_entry:${paymentId}`,
    erpnextDoctype: 'Payment Entry',
    body: placeholderBody('Payment Entry Submit', paymentId, { submit: true }),
  };
}

function placeholderBody(
  doctype: string,
  sourceId: string,
  extra: Record<string, unknown> = {},
) {
  return {
    doctype,
    source_id: sourceId,
    placeholder: true,
    ...extra,
  };
}
