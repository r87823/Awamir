import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthTokenPayload, bearerToken, verifyAuthToken } from './jwt';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authContext = authContextFromRequest(request);
    if (authContext.tokenPayload) {
      await this.ensureTokenUserIsActive(authContext.tokenPayload);
    }
    const permissions = authContext.permissions;
    const allowed = required.every((permission) =>
      hasPermission(permissions, permission),
    );

    if (!allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing required permission',
        requiredPermissions: required,
      });
    }

    return true;
  }

  private async ensureTokenUserIsActive(payload: AuthTokenPayload) {
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new ForbiddenException({
        code: 'TOKEN_USER_INACTIVE',
        message: 'Token subject is inactive or unavailable',
      });
    }
  }
}

function hasPermission(permissions: Set<string>, required: string) {
  if (permissions.has(required)) return true;
  return permissionAliases(required).some((alias) => permissions.has(alias));
}

function permissionAliases(required: string) {
  if (
    required === 'admin.master_data.view' ||
    required === 'admin.master_data.manage'
  ) {
    return ['master-data:manage'];
  }
  return [];
}

function authContextFromRequest(request: Request): {
  tokenPayload?: AuthTokenPayload;
  permissions: Set<string>;
} {
  const tokenPayload = verifyAuthToken(
    bearerToken(request.headers.authorization),
  );
  if (tokenPayload) {
    return { tokenPayload, permissions: new Set(tokenPayload.permissions) };
  }

  if (!legacyPermissionHeadersAllowed()) {
    return { permissions: new Set() };
  }

  return { permissions: parsePermissions(request.headers['x-permissions']) };
}

function legacyPermissionHeadersAllowed() {
  return (
    process.env.AUTH_ALLOW_LEGACY_HEADERS === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

function parsePermissions(value: Request['headers'][string]): Set<string> {
  if (!value) {
    return new Set();
  }

  const raw = Array.isArray(value) ? value.join(',') : value;

  return new Set(
    raw
      .split(',')
      .map((permission) => permission.trim())
      .filter(Boolean),
  );
}
