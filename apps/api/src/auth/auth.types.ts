export type LoginDto = {
  username?: string;
  password?: string;
};

export type MvpSessionUser = {
  actorId: string;
  branchId?: string;
  driverId?: string;
  departmentIds: string[];
  permissions: string[];
  displayName: string;
};

export type LoginResponse = {
  token: string;
  user: MvpSessionUser;
};
