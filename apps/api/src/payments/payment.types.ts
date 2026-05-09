import { PaymentMethod } from '@prisma/client';

export type CollectPaymentDto = {
  orderId: string;
  amount: number;
  method: PaymentMethod;
  idempotencyKey?: string;
  notes?: string;
};

export type PaymentListQuery = {
  orderId?: string;
  page?: number;
  pageSize?: number;
};
