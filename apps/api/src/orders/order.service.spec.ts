import { calculateTotals } from './order.service';

describe('calculateTotals', () => {
  it('calculates subtotal and grand total from snapshots', () => {
    expect(
      calculateTotals([
        {
          productId: 'p1',
          erpnextItemCode: 'ERP-1',
          itemName: 'Item 1',
          quantity: 2,
          unitPrice: 10.5,
          lineTotal: 21,
        },
        {
          productId: 'p2',
          erpnextItemCode: 'ERP-2',
          itemName: 'Item 2',
          quantity: 3,
          unitPrice: 4,
          lineTotal: 12,
        },
      ]),
    ).toEqual({
      subtotal: 33,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 33,
    });
  });
});
