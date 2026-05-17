import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthRateLimiter } from './auth-rate-limiter.service';
import { AuthSessionsService } from './auth-sessions.service';
import {
  ChangePasswordDto,
  LoginDto,
  LoginResponse,
  LogoutDto,
  RefreshTokenDto,
  SessionUser,
} from './auth.types';
import { hashPassword, validatePasswordPolicy } from './password-policy';

import {
  AuthTokenPayload,
  accessTokenExpiresInSeconds,
  bearerToken,
  signAuthToken,
  verifyAuthToken,
} from './jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly audit: AuditService,
    private readonly sessions: AuthSessionsService,
  ) {}

  async login(
    input: LoginDto,
    options: { ip?: string; userAgent?: string } = {},
  ): Promise<LoginResponse> {
    const username = input.username?.trim().toLowerCase();
    if (!username || !input.password) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'missing_credentials');
      throw invalidLogin();
    }
    try {
      await this.rateLimiter.assertCanAttempt({ ip: options.ip, username });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.auditLoginFailure(username, options.ip, 'rate_limited');
        await this.audit.record({
          action: 'auth.rate_limited',
          entityType: 'auth',
          payload: { username, ip: options.ip ?? null, bucket: 'login' },
        });
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: authUserInclude,
    });

    if (!user?.passwordHash || user.deletedAt) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    if (!user.isActive) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'inactive_user');
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'User is inactive',
      });
    }

    if (user.requirePasswordChange) {
      await this.auditLoginFailure(
        username,
        options.ip,
        'password_change_required',
      );
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Password change is required before login',
      });
    }

    await this.rateLimiter.recordSuccess({ ip: options.ip, username });
    const sessionUser = toSessionUser(user);
    const refreshSession = await this.sessions.createSession({
      userId: user.id,
      ip: options.ip,
      userAgent: options.userAgent,
    });
    await this.audit.record({
      action: 'auth.login_success',
      actorId: user.id,
      entityType: 'auth_session',
      entityId: refreshSession.session.id,
      payload: { username: user.username, ip: options.ip ?? null },
    });
    return buildLoginResponse(user, sessionUser, refreshSession);
  }

  async refresh(
    input: RefreshTokenDto,
    options: { ip?: string; userAgent?: string } = {},
  ): Promise<LoginResponse> {
    try {
      await this.rateLimiter.assertCanAttempt({
        ip: options.ip,
        username: 'refresh',
        bucket: 'refresh',
      });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.audit.record({
          action: 'auth.refresh_rate_limited',
          entityType: 'auth_session',
          payload: { ip: options.ip ?? null },
        });
      }
      throw error;
    }
    const session = await this.sessions.findByRefreshToken(input.refreshToken);
    if (!session) {
      await this.rateLimiter.recordFailure({
        ip: options.ip,
        username: 'refresh',
        bucket: 'refresh',
      });
      throw invalidRefreshToken();
    }
    if (session.revokedAt) {
      await this.rateLimiter.recordFailure({
        ip: options.ip,
        username: 'refresh',
        bucket: 'refresh',
      });
      await this.sessions.revokeActiveSessionsForUser({
        userId: session.userId,
        reason: 'refresh_reuse_detected',
      });
      await this.audit.record({
        action: 'auth.refresh_reuse_detected',
        actorId: session.userId,
        entityType: 'auth_session',
        entityId: session.id,
        payload: { revokedReason: session.revokedReason ?? null },
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_REUSED',
        message: 'Refresh token has already been used',
      });
    }
    if (session.expiresAt <= new Date()) {
      await this.rateLimiter.recordFailure({
        ip: options.ip,
        username: 'refresh',
        bucket: 'refresh',
      });
      await this.sessions.revokeSession(session.id, 'expired', {
        lastUsed: true,
      });
      throw new UnauthorizedException({
        code: 'REFRESH_TOKEN_EXPIRED',
        message: 'Refresh token has expired',
      });
    }

    const user = await this.loadActiveAuthUser(session.userId);
    if (!user) {
      await this.rateLimiter.recordFailure({
        ip: options.ip,
        username: 'refresh',
        bucket: 'refresh',
      });
      await this.sessions.revokeSession(session.id, 'user_inactive', {
        lastUsed: true,
      });
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'User is inactive',
      });
    }
    await this.rateLimiter.recordSuccess({
      ip: options.ip,
      username: 'refresh',
      bucket: 'refresh',
    });

    const rotated = await this.sessions.rotateSession(session, {
      ip: options.ip,
      userAgent: options.userAgent,
    });
    await this.audit.record({
      action: 'auth.refresh_success',
      actorId: user.id,
      entityType: 'auth_session',
      entityId: rotated.session.id,
      payload: { replacedSessionId: session.id },
    });
    return buildLoginResponse(user, toSessionUser(user), rotated);
  }

  async logout(
    input: LogoutDto,
    options: { authorization?: string; ip?: string } = {},
  ) {
    const payload = verifyAuthToken(bearerToken(options.authorization));
    const refreshSession = input.refreshToken
      ? await this.sessions.findByRefreshToken(input.refreshToken)
      : null;
    const sessionId = refreshSession?.id ?? payload?.sid;
    await this.sessions.revokeSession(sessionId, 'logout', { lastUsed: true });
    await this.audit.record({
      action: 'auth.logout',
      actorId: refreshSession?.userId ?? payload?.sub,
      entityType: 'auth_session',
      entityId: sessionId,
      payload: { ip: options.ip ?? null },
    });
    return { ok: true };
  }

  async changePassword(
    input: ChangePasswordDto,
    options: { ip?: string; userAgent?: string } = {},
  ) {
    const username = input.username?.trim().toLowerCase();
    if (!username || !input.currentPassword || !input.newPassword) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'missing_credentials');
      throw invalidLogin();
    }
    try {
      await this.rateLimiter.assertCanAttempt({ ip: options.ip, username });
    } catch (error) {
      if (
        error instanceof HttpException &&
        error.getStatus() === HttpStatus.TOO_MANY_REQUESTS
      ) {
        await this.auditLoginFailure(username, options.ip, 'rate_limited');
        await this.audit.record({
          action: 'auth.rate_limited',
          entityType: 'auth',
          payload: { username, ip: options.ip ?? null, bucket: 'login' },
        });
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user?.passwordHash || user.deletedAt) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    const passwordMatches = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!passwordMatches) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'invalid_credentials');
      throw invalidLogin();
    }

    if (!user.isActive) {
      await this.rateLimiter.recordFailure({ ip: options.ip, username });
      await this.auditLoginFailure(username, options.ip, 'inactive_user');
      throw new ForbiddenException({
        code: 'USER_INACTIVE',
        message: 'User is inactive',
      });
    }

    validatePasswordPolicy(input.newPassword);
    const passwordHash = await hashPassword(input.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        requirePasswordChange: false,
        passwordChangedAt: new Date(),
      },
    });
    const revoked = await this.sessions.revokeActiveSessionsForUser({
      userId: user.id,
      reason: 'password_change',
    });
    await this.rateLimiter.recordSuccess({ ip: options.ip, username });
    await this.audit.record({
      action: 'auth.password_changed',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      payload: { ip: options.ip ?? null, userAgent: options.userAgent ?? null },
    });
    await this.audit.record({
      action: 'auth.sessions_revoked_due_to_password_change',
      actorId: user.id,
      entityType: 'user',
      entityId: user.id,
      payload: { reason: 'password_change', count: revoked.count },
    });
    return { ok: true };
  }

  async logoutAll(authorization: string | undefined) {
    const payload = await this.requireActiveAccessToken(authorization);
    await this.sessions.revokeActiveSessionsForUser({
      userId: payload.sub,
      reason: 'logout_all',
    });
    await this.audit.record({
      action: 'auth.logout_all',
      actorId: payload.sub,
      entityType: 'user',
      entityId: payload.sub,
    });
    return { ok: true };
  }

  async listOwnSessions(authorization: string | undefined) {
    const payload = await this.requireActiveAccessToken(authorization);
    return { sessions: await this.sessions.listSessionsForUser(payload.sub) };
  }

  async listSessionsForUserForAdmin(userId: string) {
    return { sessions: await this.sessions.listSessionsForUser(userId) };
  }

  async revokeSessionsForUser(
    userId: string,
    reason: string,
    auditAction = 'auth.session_revoked',
    actorId?: string,
  ) {
    const result = await this.sessions.revokeActiveSessionsForUser({
      userId,
      reason,
    });
    await this.audit.record({
      action: auditAction,
      actorId,
      entityType: 'user',
      entityId: userId,
      payload: { reason, count: result.count },
    });
    return result;
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

  private async requireActiveAccessToken(
    authorization: string | undefined,
  ): Promise<AuthTokenPayload> {
    const payload = verifyAuthToken(bearerToken(authorization));
    if (!payload) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required',
      });
    }
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
    if (payload.sid) {
      const session = await this.sessions.findSessionById(payload.sid);
      if (
        !session ||
        session.userId !== payload.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException({
          code: 'TOKEN_SESSION_REVOKED',
          message: 'Token session is no longer active',
        });
      }
    }
    return payload;
  }

  private async loadActiveAuthUser(id: string) {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, deletedAt: null },
      include: authUserInclude,
    });
  }
}

function invalidLogin() {
  return new BadRequestException({
    code: 'INVALID_LOGIN',
    message: 'Invalid username or password',
  });
}

function invalidRefreshToken() {
  return new UnauthorizedException({
    code: 'INVALID_REFRESH_TOKEN',
    message: 'Invalid refresh token',
  });
}

function buildLoginResponse(
  user: AuthUserRecord,
  sessionUser: SessionUser,
  refreshSession: Awaited<ReturnType<AuthSessionsService['createSession']>>,
): LoginResponse {
  const accessToken = signAuthToken({
    sub: user.id,
    sid: refreshSession.session.id,
    username: user.username,
    ...sessionUser,
  });
  return {
    token: accessToken,
    accessToken,
    refreshToken: refreshSession.refreshToken,
    expiresIn: accessTokenExpiresInSeconds(),
    refreshExpiresIn: refreshSession.expiresIn,
    user: sessionUser,
  };
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
  include: typeof authUserInclude;
}>;

const authUserInclude = {
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
} satisfies Prisma.UserInclude;
