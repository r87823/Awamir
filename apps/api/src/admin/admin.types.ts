import {
  AppSettingValueType,
  ERPNextSyncOperation,
  ERPNextSyncStatus,
} from '@prisma/client';
import { PaginationInput } from '../common/pagination';

export type AdminActor = {
  actorId?: string;
};

export type AdminUsersQuery = PaginationInput & {
  search?: string;
  isActive?: string | boolean;
};

export type AdminOutboxQuery = PaginationInput & {
  status?: ERPNextSyncStatus;
  operation?: ERPNextSyncOperation;
  sourceType?: string;
  sourceId?: string;
};

export type AdminSyncLogsQuery = PaginationInput & {
  status?: ERPNextSyncStatus;
  operation?: ERPNextSyncOperation;
  outboxId?: string;
};

export type CreateAdminUserDto = {
  username: string;
  password: string;
  displayName: string;
  email?: string;
  driverId?: string;
  isActive?: boolean;
  branchIds?: string[];
  departmentIds?: string[];
};

export type UpdateAdminUserDto = Partial<
  Omit<CreateAdminUserDto, 'username'>
> & {
  username?: string;
};

export type AssignUserRoleDto = {
  roleId: string;
};

export type UpdateAppSettingDto = {
  value: unknown;
};

export type AdminSettingDefinition = {
  key: string;
  valueType: AppSettingValueType;
  isSecret: boolean;
  isMutable: boolean;
  defaultValue?: unknown;
  source: 'db' | 'env';
};
