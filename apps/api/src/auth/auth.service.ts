import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, LoginResponse, SessionUser } from './auth.types';
import { signAuthToken } from './jwt';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(input: LoginDto): Promise<LoginResponse> {
    const username = input.username?.trim().toLowerCase();
    if (!username || !input.password) {
      throw invalidLogin();
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
      throw invalidLogin();
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw invalidLogin();
    }

    if (!user.isActive) {
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'User is inactive',
      });
    }

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
