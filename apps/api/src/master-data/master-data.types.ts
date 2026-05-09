export type ActorContext = {
  actorId?: string;
};

export type BranchInput = {
  code: string;
  nameAr: string;
  nameEn: string;
  isActive?: boolean;
};

export type ProductionCenterInput = {
  branchId: string;
  code: string;
  nameAr: string;
  nameEn: string;
  isActive?: boolean;
};

export type DepartmentInput = {
  code: string;
  nameAr: string;
  nameEn: string;
  isActive?: boolean;
};

export type ProductInput = {
  code: string;
  nameAr: string;
  nameEn: string;
  erpnextItemCode: string;
  itemGroup?: string;
  stockUom?: string;
  isStockItem?: boolean;
  isActive?: boolean;
};

export type ItemDepartmentMappingInput = {
  productId: string;
  departmentId: string;
  productionCenterId?: string;
  isActive?: boolean;
};
