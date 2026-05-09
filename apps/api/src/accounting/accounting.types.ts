import { AccountingStatus, PaymentMethod, PaymentStatus } from '@prisma/client';

export type AccountingListQuery = {
  page?: number;
  pageSize?: number;
  branchId?: string;
  accountingStatus?: AccountingStatus;
  fromDate?: string;
  toDate?: string;
  needsReview?: string | boolean;
};

export type AccountingPaymentsQuery = {
  page?: number;
  pageSize?: number;
  status?: PaymentStatus;
  method?: PaymentMethod;
  fromDate?: string;
  toDate?: string;
  needsReview?: string | boolean;
};

export type AccountingBusinessDateDto = {
  businessDate?: string;
  notes?: string;
};
