import { OrderStatus } from '@prisma/client';

export type CreateOrderItemDto = {
  productId: string;
  quantity: number;
  unitPrice?: number;
};

export type CreateOrderDto = {
  branchId: string;
  destinationBranchId?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
  items: CreateOrderItemDto[];
};

export type UpdateOrderDto = Partial<
  Pick<
    CreateOrderDto,
    | 'customerId'
    | 'customerName'
    | 'customerPhone'
    | 'customerAddress'
    | 'destinationBranchId'
    | 'notes'
  >
> & {
  version: number;
  items?: CreateOrderItemDto[];
};

export type OrderFiltersDto = {
  branchId?: string;
  status?: OrderStatus;
  customerName?: string;
  page?: number;
  pageSize?: number;
};

export type OrderActorContext = {
  actorId?: string;
  branchId?: string;
  driverId?: string;
  departmentIds: Set<string>;
  permissions: Set<string>;
};

export type OrderTransitionAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'return_for_edit'
  | 'cancel';

export type RejectOrderDto = {
  rejectionReason?: string;
};

export type ReturnForEditDto = {
  notes?: string;
};
