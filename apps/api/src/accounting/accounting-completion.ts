import { AccountingStatus } from '@prisma/client';

export type AccountingCompletionOrder = {
  erpnextSalesOrderId: string | null;
  erpnextSalesInvoiceId: string | null;
  accountingStatus: AccountingStatus;
};

export type AccountingCompletionPayment = {
  erpnextPaymentEntryId: string | null;
  status: string;
};

export function accountingStatusAfterCompletionCheck(
  order: AccountingCompletionOrder,
  payments: AccountingCompletionPayment[],
): AccountingStatus {
  if (!order.erpnextSalesOrderId || !order.erpnextSalesInvoiceId) {
    return order.accountingStatus;
  }

  const paymentSyncIncomplete = payments.some(
    (payment) =>
      payment.status !== 'CANCELLED' &&
      payment.status !== 'POSTED' &&
      !payment.erpnextPaymentEntryId,
  );

  if (paymentSyncIncomplete) {
    return order.accountingStatus;
  }

  return 'ACCOUNTING_POSTED';
}
