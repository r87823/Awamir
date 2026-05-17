export type LoginDto = {
  username?: string;
  password?: string;
};

export type RefreshTokenDto = {
  refreshToken?: string;
};

export type LogoutDto = {
  refreshToken?: string;
};

export type ChangePasswordDto = {
  username?: string;
  currentPassword?: string;
  newPassword?: string;
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
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: SessionUser;
};
