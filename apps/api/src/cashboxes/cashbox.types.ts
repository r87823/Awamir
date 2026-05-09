export type SubmitCashboxDto = {
  collectedCash: number;
  notes?: string;
};

export type ReturnCashboxDto = {
  reason?: string;
};

export type CloseCashboxDayDto = {
  businessDate?: string;
};

export type CashboxListQuery = {
  page?: number;
  pageSize?: number;
  businessDate?: string;
  status?: string;
};
