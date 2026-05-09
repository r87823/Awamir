import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const permissions = parsePermissions(request.headers['x-permissions']);
    const allowed = required.every((permission) => permissions.has(permission));

    if (!allowed) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Missing required permission',
        requiredPermissions: required,
      });
    }

    return true;
  }
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
