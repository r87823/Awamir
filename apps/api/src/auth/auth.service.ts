import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimiter } from './auth-rate-limiter.service';
import { LoginDto, LoginResponse, SessionUser } from './auth.types';
import { signAuthToken } from './jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly audit: AuditService,
  ) {}

  async login(
    input: LoginDto,
    options: { ip?: string } = {},
  ): Promise<LoginResponse> {
    const username = input.username?.trim().toLowerCase();
    if (!username || !input.password) {
      this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'missing_credentials');
      throw invalidLogin();
    }
    try {
      this.rateLimiter.assertCanAttempt({ ip: options.ip, username });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.auditLoginFailure(username, options.ip, 'rate_limited');
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
        branchAccess: {
          include: {
            branch: true,
          },
        },
        departmentAccess: {
          include: {
            department: true,
          },
        },
      },
    });

    if (!user?.passwordHash || user.deletedAt) {
      this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    if (!user.isActive) {
      this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'inactive_user');
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'User is inactive',
      });
    }

    this.rateLimiter.recordSuccess({ ip: options.ip, username });
    const sessionUser = toSessionUser(user);
    return {
      token: signAuthToken({
        sub: user.id,
        username: user.username,
        ...sessionUser,
      }),
      user: sessionUser,
    };
  }

  private async auditLoginFailure(
    username: string | undefined,
    ip: string | undefined,
    reason: string,
  ) {
    await this.audit.record({
      action: 'auth.login_failed',
      entityType: 'auth',
      payload: {
        username: username ?? null,
        ip: ip ?? null,
        reason,
      },
    });
  }
}

function invalidLogin() {
  return new BadRequestException({
    code: 'INVALID_LOGIN',
    message: 'Invalid username or password',
  });
}

function toSessionUser(user: AuthUserRecord): SessionUser {
  const permissions = new Set<string>();
  for (const userRole of user.roles) {
    if (!userRole.role.isActive || userRole.role.deletedAt) continue;
    for (const rolePermission of userRole.role.permissions) {
      permissions.add(rolePermission.permission.code);
    }
  }

  const branchIds = user.branchAccess
    .filter((access) => access.branch.isActive && !access.branch.deletedAt)
    .map((access) => access.branchId);

  const departmentIds = user.departmentAccess
    .filter(
      (access) => access.department.isActive && !access.department.deletedAt,
    )
    .map((access) => access.departmentId);

  return {
    actorId: user.id,
    displayName: user.displayName,
    branchId: branchIds[0],
    branchIds,
    driverId: user.driverId ?? undefined,
    departmentIds,
    permissions: [...permissions].sort(),
  };
}

type AuthUserRecord = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true;
              };
            };
          };
        };
      };
    };
    branchAccess: {
      include: {
        branch: true;
      };
    };
    departmentAccess: {
      include: {
        department: true;
      };
    };
  };
}>;
