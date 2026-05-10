export type LoginDto = {
  username?: string;
  password?: string;
};

export type SessionUser = {
  actorId: string;
  branchId?: string;
  branchIds: string[];
  driverId?: string;
  departmentIds: string[];
  permissions: string[];
  displayName: string;
};

export type LoginResponse = {
  token: string;
  user: SessionUser;
};
