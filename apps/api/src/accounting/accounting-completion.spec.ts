import { accountingStatusAfterCompletionCheck } from './accounting-completion';

describe('accountingStatusAfterCompletionCheck', () => {
  it('keeps current status when references are incomplete', () => {
    expect(
      accountingStatusAfterCompletionCheck(
        {
          erpnextSalesOrderId: 'SO-1',
          erpnextSalesInvoiceId: null,
          accountingStatus: 'SALES_ORDER_CREATED',
        },
        [],
      ),
    ).toBe('SALES_ORDER_CREATED');
  });

  it('sets ACCOUNTING_POSTED only when order and payments are complete', () => {
    expect(
      accountingStatusAfterCompletionCheck(
        {
          erpnextSalesOrderId: 'SO-1',
          erpnextSalesInvoiceId: 'SI-1',
          accountingStatus: 'PAYMENT_SUBMITTED',
        },
        [{ erpnextPaymentEntryId: 'PE-1', status: 'POSTED' }],
      ),
    ).toBe('ACCOUNTING_POSTED');
  });
});
