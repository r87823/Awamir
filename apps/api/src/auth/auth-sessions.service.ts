import { Injectable } from '@nestjs/common';
import { AuthSession } from '@prisma/client';
import { createHmac, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type CreateSessionInput = {
  userId: string;
  userAgent?: string;
  ip?: string;
};

type RevokeManyInput = {
  userId: string;
  reason: string;
  excludeSessionId?: string;
};

@Injectable()
export class AuthSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(input: CreateSessionInput) {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresIn = refreshTokenExpiresInSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const session = await this.prisma.authSession.create({
      data: {
        userId: input.userId,
        refreshTokenHash,
        userAgent: normalizeUserAgent(input.userAgent),
        ipHash: hashIp(input.ip),
        expiresAt,
      },
    });
    return { session, refreshToken, expiresIn };
  }

  async findByRefreshToken(refreshToken: string | undefined) {
    const value = refreshToken?.trim();
    if (!value) return null;
    return this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(value) },
      include: { user: true },
    });
  }

  async rotateSession(
    session: AuthSession,
    input: Omit<CreateSessionInput, 'userId'>,
  ) {
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const expiresIn = refreshTokenExpiresInSeconds();
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const replacement = await this.prisma.$transaction(async (tx) => {
      const created = await tx.authSession.create({
        data: {
          userId: session.userId,
          refreshTokenHash,
          userAgent: normalizeUserAgent(input.userAgent),
          ipHash: hashIp(input.ip),
          expiresAt,
        },
      });
      await tx.authSession.update({
        where: { id: session.id },
        data: {
          revokedAt: session.revokedAt ?? new Date(),
          revokedReason: session.revokedReason ?? 'rotated',
          replacedBySessionId: created.id,
          lastUsedAt: new Date(),
        },
      });
      return created;
    });
    return { session: replacement, refreshToken, expiresIn };
  }

  async revokeSession(
    id: string | undefined,
    reason: string,
    options: { lastUsed?: boolean } = {},
  ) {
    if (!id) return null;
    const existing = await this.prisma.authSession.findUnique({
      where: { id },
    });
    if (!existing) return null;
    if (existing.revokedAt) return existing;
    return this.prisma.authSession.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
        lastUsedAt: options.lastUsed ? new Date() : existing.lastUsedAt,
      },
    });
  }

  async revokeRefreshToken(refreshToken: string | undefined, reason: string) {
    const session = await this.findByRefreshToken(refreshToken);
    if (!session) return null;
    return this.revokeSession(session.id, reason, { lastUsed: true });
  }

  async revokeActiveSessionsForUser(input: RevokeManyInput) {
    return this.prisma.authSession.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        ...(input.excludeSessionId
          ? { id: { not: input.excludeSessionId } }
          : {}),
      },
      data: {
        revokedAt: new Date(),
        revokedReason: input.reason,
      },
    });
  }

  async listSessionsForUser(userId: string) {
    const sessions = await this.prisma.authSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return sessions.map(sessionMetadata);
  }
}

export function refreshTokenExpiresInSeconds() {
  const days = Number(process.env.AUTH_REFRESH_TOKEN_TTL_DAYS ?? 30);
  if (!Number.isFinite(days) || days <= 0) return 30 * 24 * 60 * 60;
  return Math.floor(days * 24 * 60 * 60);
}

export function hashRefreshToken(refreshToken: string) {
  return createHmac('sha256', refreshTokenSecret())
    .update(refreshToken)
    .digest('hex');
}

export function sessionMetadata(session: AuthSession) {
  return {
    id: session.id,
    userId: session.userId,
    userAgent: session.userAgent,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    revokedAt: session.revokedAt,
    revokedReason: session.revokedReason,
    replacedBySessionId: session.replacedBySessionId,
    lastUsedAt: session.lastUsedAt,
    isActive: !session.revokedAt && session.expiresAt > new Date(),
  };
}

function generateRefreshToken() {
  return `awamir_rt_${randomBytes(48).toString('base64url')}`;
}

function hashIp(ip: string | undefined) {
  const value = ip?.trim();
  if (!value) return null;
  return createHmac('sha256', refreshTokenSecret()).update(value).digest('hex');
}

function refreshTokenSecret() {
  return process.env.AUTH_REFRESH_TOKEN_SECRET || authJwtSecret();
}

function authJwtSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  if (secret) return secret;
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.NODE_ENV === 'staging'
  ) {
    throw new Error('AUTH_JWT_SECRET is required in staging/production');
  }
  return 'dev-awamir-auth-secret-change-me';
}

function normalizeUserAgent(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 1000);
}
