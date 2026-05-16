import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { adminActorFromRequest } from './admin-context';
import { AdminService } from './admin.service';
import {
  AdminOutboxQuery,
  AdminSyncLogsQuery,
  AdminUsersQuery,
  AssignUserRoleDto,
  CreateAdminUserDto,
  UpdateAdminUserDto,
  UpdateAppSettingDto,
} from './admin.types';

@UseGuards(PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @RequirePermissions('admin.users.view')
  listUsers(@Query() query: AdminUsersQuery) {
    return this.admin.listUsers(coercePagination(query));
  }

  @Post('users')
  @RequirePermissions('admin.users.manage')
  createUser(@Body() body: CreateAdminUserDto, @Req() request: Request) {
    return this.admin.createUser(body, adminActorFromRequest(request));
  }

  @Get('users/:id')
  @RequirePermissions('admin.users.view')
  getUser(@Param('id') id: string) {
    return this.admin.getUser(id);
  }

  @Get('users/:id/sessions')
  @RequirePermissions('admin.users.view')
  listUserSessions(@Param('id') id: string) {
    return this.admin.listUserSessions(id);
  }

  @Post('users/:id/sessions/revoke')
  @RequirePermissions('admin.users.manage')
  revokeUserSessions(@Param('id') id: string, @Req() request: Request) {
    return this.admin.revokeUserSessions(id, adminActorFromRequest(request));
  }

  @Patch('users/:id')
  @RequirePermissions('admin.users.manage')
  updateUser(
    @Param('id') id: string,
    @Body() body: UpdateAdminUserDto,
    @Req() request: Request,
  ) {
    return this.admin.updateUser(id, body, adminActorFromRequest(request));
  }

  @Post('users/:id/activate')
  @RequirePermissions('admin.users.manage')
  activateUser(@Param('id') id: string, @Req() request: Request) {
    return this.admin.activateUser(id, adminActorFromRequest(request));
  }

  @Post('users/:id/deactivate')
  @RequirePermissions('admin.users.manage')
  deactivateUser(@Param('id') id: string, @Req() request: Request) {
    return this.admin.deactivateUser(id, adminActorFromRequest(request));
  }

  @Get('roles')
  @RequirePermissions('admin.roles.view')
  listRoles() {
    return this.admin.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('admin.roles.view')
  listPermissions() {
    return this.admin.listPermissions();
  }

  @Get('security/credential-hygiene')
  @RequirePermissions('admin.users.view')
  credentialHygiene() {
    return this.admin.credentialHygieneReport();
  }

  @Post('users/:id/roles')
  @RequirePermissions('admin.roles.manage')
  assignUserRole(
    @Param('id') id: string,
    @Body() body: AssignUserRoleDto,
    @Req() request: Request,
  ) {
    return this.admin.assignRole(id, body, adminActorFromRequest(request));
  }

  @Delete('users/:id/roles/:roleId')
  @RequirePermissions('admin.roles.manage')
  removeUserRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Req() request: Request,
  ) {
    return this.admin.removeRole(id, roleId, adminActorFromRequest(request));
  }

  @Get('settings')
  @RequirePermissions('admin.settings.view')
  listSettings() {
    return this.admin.listSettings();
  }

  @Patch('settings/:key')
  @RequirePermissions('admin.settings.manage')
  updateSetting(
    @Param('key') key: string,
    @Body() body: UpdateAppSettingDto,
    @Req() request: Request,
  ) {
    return this.admin.updateSetting(key, body, adminActorFromRequest(request));
  }

  @Get('erpnext/outbox')
  @RequirePermissions('admin.erpnext.view')
  listERPNextOutbox(@Query() query: AdminOutboxQuery) {
    return this.admin.listERPNextOutbox(coercePagination(query));
  }

  @Get('erpnext/sync-logs')
  @RequirePermissions('admin.erpnext.view')
  listERPNextSyncLogs(@Query() query: AdminSyncLogsQuery) {
    return this.admin.listERPNextSyncLogs(coercePagination(query));
  }

  @Post('erpnext/outbox/:id/retry')
  @RequirePermissions('admin.erpnext.retry')
  retryERPNextOutbox(@Param('id') id: string, @Req() request: Request) {
    return this.admin.retryOutbox(id, adminActorFromRequest(request));
  }
}

function coercePagination<
  T extends { page?: number | string; pageSize?: number | string },
>(query: T): T {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
