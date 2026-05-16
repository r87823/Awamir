import {
  CashboxStatus,
  ERPNextSyncOperation,
  ERPNextSyncStatus,
  PaymentMethod,
  PaymentStatus,
} from '@prisma/client';

export type ReportDateQuery = {
  dateFrom?: string;
  dateTo?: string;
};

export type OrdersStatusReportQuery = ReportDateQuery & {
  branchId?: string;
  destinationBranchId?: string;
};

export type ProductionDelaysReportQuery = ReportDateQuery & {
  productionCenterId?: string;
  departmentId?: string;
  branchId?: string;
  page?: number;
  pageSize?: number;
};

export type DeliveryReturnsReportQuery = ReportDateQuery & {
  destinationBranchId?: string;
  driverId?: string;
  page?: number;
  pageSize?: number;
};

export type PaymentsSummaryReportQuery = ReportDateQuery & {
  branchId?: string;
  collectedBy?: string;
  method?: PaymentMethod;
};

export type CashboxDailyReportQuery = ReportDateQuery & {
  userId?: string;
  status?: CashboxStatus;
};

export type ERPNextFailuresReportQuery = ReportDateQuery & {
  sourceType?: string;
  operation?: ERPNextSyncOperation;
  status?: ERPNextSyncStatus;
  page?: number;
  pageSize?: number;
};

export type AccountingCloseDayReportQuery = ReportDateQuery;

export type ReportRange = {
  dateFrom: string;
  dateTo: string;
};

export type PaymentSummaryStatus = PaymentStatus | 'PAID' | 'PARTIALLY_PAID';
