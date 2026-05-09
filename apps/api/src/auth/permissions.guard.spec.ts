import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
