import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { signAuthToken } from './jwt';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  it('allows requests with all required permissions', async () => {
    const guard = createGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['master-data:manage']),
    } as unknown as Reflector);

    await expect(
      guard.canActivate(contextWithPermissions('master-data:manage')),
    ).resolves.toBe(true);
  });

  it('rejects requests missing required permissions', async () => {
    const guard = createGuard({
      getAllAndOverride: jest.fn().mockReturnValue(['master-data:manage']),
    } as unknown as Reflector);

    await expect(guard.canActivate(contextWithPermissions(''))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows requests with permissions from a valid bearer token', async () => {
    const guard = createGuard({
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

    await expect(
      guard.canActivate(contextWithBearerToken(token)),
    ).resolves.toBe(true);
  });

  it('allows legacy master-data manage permission for split admin master-data permissions', async () => {
    const guard = createGuard({
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['admin.master_data.manage']),
    } as unknown as Reflector);

    await expect(
      guard.canActivate(contextWithPermissions('master-data:manage')),
    ).resolves.toBe(true);
  });
});

function createGuard(reflector: Reflector) {
  return new PermissionsGuard(reflector, {
    user: {
      findFirst: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
  } as never);
}

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
