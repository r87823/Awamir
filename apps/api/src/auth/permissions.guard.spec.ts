import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signAuthToken } from './jwt';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  it('allows requests with all required permissions', () => {
    const guard = new PermissionsGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['master-data:manage']),
    } as unknown as Reflector);

    expect(
      guard.canActivate(contextWithPermissions('master-data:manage')),
    ).toBe(true);
  });

  it('rejects requests missing required permissions', () => {
    const guard = new PermissionsGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['master-data:manage']),
    } as unknown as Reflector);

    expect(() => guard.canActivate(contextWithPermissions(''))).toThrow(
      ForbiddenException,
    );
  });

  it('allows requests with permissions from a valid bearer token', () => {
    const guard = new PermissionsGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['notifications:view']),
    } as unknown as Reflector);
    const token = signAuthToken({
      sub: 'user-1',
      username: 'operator',
      actorId: 'user-1',
      displayName: 'Operator',
      permissions: ['notifications:view'],
      branchIds: [],
      departmentIds: [],
    });

    expect(guard.canActivate(contextWithBearerToken(token))).toBe(true);
  });
});

function contextWithPermissions(value: string) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          'x-permissions': value,
        },
      }),
    }),
  } as never;
}

function contextWithBearerToken(token: string) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    }),
  } as never;
}
