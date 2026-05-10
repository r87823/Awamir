import { createHmac, timingSafeEqual } from 'node:crypto';

export type AuthTokenPayload = {
  sub: string;
  username: string;
  actorId: string;
  displayName: string;
  permissions: string[];
  branchId?: string;
  branchIds: string[];
  departmentIds: string[];
  driverId?: string;
  exp: number;
};

export function signAuthToken(payload: Omit<AuthTokenPayload, 'exp'>): string {
  const expiresInSeconds = Number(
    process.env.AUTH_JWT_EXPIRES_IN_SECONDS ?? 8 * 60 * 60,
  );
  const fullPayload: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = sign(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAuthToken(
  token: string | undefined,
): AuthTokenPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, signature] = parts;
  const expected = sign(`${encodedHeader}.${encodedPayload}`);
  if (!safeEqual(signature, expected)) return null;

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader)) as {
      alg?: string;
    };
    if (header.alg !== 'HS256') return null;
    const payload = JSON.parse(
      base64UrlDecode(encodedPayload),
    ) as AuthTokenPayload;
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000))
      return null;
    if (!Array.isArray(payload.permissions)) return null;
    if (!Array.isArray(payload.branchIds)) return null;
    if (!Array.isArray(payload.departmentIds)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearerToken(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw?.startsWith('Bearer ')) return undefined;
  return raw.slice('Bearer '.length).trim();
}

function sign(value: string) {
  return createHmac('sha256', jwtSecret()).update(value).digest('base64url');
}

function jwtSecret() {
  if (process.env.AUTH_JWT_SECRET) return process.env.AUTH_JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_JWT_SECRET is required in production');
  }
  return 'dev-awamir-auth-secret-change-me';
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}
