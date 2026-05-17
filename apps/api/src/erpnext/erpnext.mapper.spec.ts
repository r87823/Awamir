import { PaymentMethod } from '@prisma/client';
import {
  ERPNextSyncValidationError,
  buildDraftPaymentEntryRequest,
  buildSalesOrderRequest,
} from './erpnext.mapper';
import { ERPNextConfig } from './erpnext.types';

describe('ERPNext mapper', () => {
  it('builds a real Sales Order payload', () => {
    const request = buildSalesOrderRequest(
      {
        id: 'order-1',
        orderNumber: 'ORD-1',
        customerId: 'CUST-1',
        createdAt: new Date('2026-05-10T00:00:00.000Z'),
        items: [
          {
            id: 'item-1',
            erpnextItemCode: 'ITEM-1',
            itemName: 'Item',
            quantity: 2,
            unitPrice: 12.5,
          },
        ],
      } as never,
      baseConfig(),
    );

    expect(request).toEqual(
      expect.objectContaining({
        path: '/api/resource/Sales Order',
        body: expect.objectContaining({
          doctype: 'Sales Order',
          customer: 'CUST-1',
          company: 'Awamir',
          items: [
            expect.objectContaining({
              item_code: 'ITEM-1',
              warehouse: 'Stores - A',
            }),
          ],
        }),
      }),
    );
  });

  it('rejects missing item code with a safe code', () => {
    expect(() =>
      buildSalesOrderRequest(
        {
          id: 'order-1',
          orderNumber: 'ORD-1',
          customerId: 'CUST-1',
          createdAt: new Date(),
          items: [
            {
              id: 'item-1',
              erpnextItemCode: '',
              itemName: 'Item',
              quantity: 1,
              unitPrice: 10,
            },
          ],
        } as never,
        baseConfig(),
      ),
    ).toThrow(ERPNextSyncValidationError);
  });

  it('rejects missing payment accounts', () => {
    expect(() =>
      buildDraftPaymentEntryRequest(
        {
          id: 'payment-1',
          orderId: 'order-1',
          amount: 10,
          method: PaymentMethod.CARD,
          collectedAt: new Date(),
          order: {
            id: 'order-1',
            customerId: 'CUST-1',
            erpnextSalesInvoiceId: null,
          },
        } as never,
        { ...baseConfig(), cardAccount: undefined },
      ),
    ).toThrow(ERPNextSyncValidationError);
  });

  it('does not link draft Payment Entry to an unsubmitted Sales Invoice', () => {
    const request = buildDraftPaymentEntryRequest(
      {
        id: 'payment-1',
        orderId: 'order-1',
        amount: 10,
        method: PaymentMethod.CASH,
        collectedAt: new Date('2026-05-10T00:00:00.000Z'),
        order: {
          id: 'order-1',
          customerId: 'CUST-1',
          erpnextSalesInvoiceId: 'ACC-SINV-DRAFT',
          accountingStatus: 'DRAFT_INVOICE_CREATED',
        },
      } as never,
      baseConfig(),
    );

    expect(request.body.references).toEqual([]);
  });

  it('links draft Payment Entry to submitted Sales Invoice only', () => {
    const request = buildDraftPaymentEntryRequest(
      {
        id: 'payment-1',
        orderId: 'order-1',
        amount: 10,
        method: PaymentMethod.CASH,
        collectedAt: new Date('2026-05-10T00:00:00.000Z'),
        order: {
          id: 'order-1',
          customerId: 'CUST-1',
          erpnextSalesInvoiceId: 'ACC-SINV-SUBMITTED',
          accountingStatus: 'INVOICE_SUBMITTED',
        },
      } as never,
      baseConfig(),
    );

    expect(request.body.references).toEqual([
      expect.objectContaining({
        reference_doctype: 'Sales Invoice',
        reference_name: 'ACC-SINV-SUBMITTED',
        allocated_amount: 10,
      }),
    ]);
  });
});

function baseConfig(): ERPNextConfig {
  return {
    baseUrl: 'http://erpnext.test',
    apiKey: 'key',
    apiSecret: 'secret',
    company: 'Awamir',
    timeoutMs: 5000,
    defaultWarehouse: 'Stores - A',
    receivableAccount: 'Debtors - A',
    incomeAccount: 'Sales - A',
    cashAccount: 'Cash - A',
    cardAccount: 'Card - A',
    transferAccount: 'Bank - A',
    onlineAccount: 'Online - A',
    creditAccount: 'Debtors - A',
  };
}
