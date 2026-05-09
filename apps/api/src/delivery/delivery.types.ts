export type DeliveryReadyOrdersQuery = {
  destinationBranchId?: string;
  page?: number;
  pageSize?: number;
};

export type CreateDeliveryBatchDto = {
  orderIds: string[];
  idempotencyKey?: string;
};

export type AssignDriverDto = {
  driverId?: string;
};

export type DeliveryProofDto = {
  receivedByName?: string;
  deliveredAt?: string;
  notes?: string;
};

export type DeliveryReturnDto = {
  reasonCode?: string;
  notes?: string;
};
