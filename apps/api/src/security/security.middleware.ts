import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    applySecurityHeaders(response);
    applyCors(request, response);

    if (request.method === 'OPTIONS') {
      response.status(204).end();
      return;
    }

    next();
  }
}

function applySecurityHeaders(response: Response) {
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.setHeader('cross-origin-resource-policy', 'same-site');
  response.setHeader('x-dns-prefetch-control', 'off');
}

function applyCors(request: Request, response: Response) {
  const origin = headerValue(request.headers.origin);
  const allowedOrigins = configuredOrigins();
  const allowAll = allowedOrigins.includes('*') && !strictRuntime();

  if (origin && (allowAll || allowedOrigins.includes(origin))) {
    response.setHeader('access-control-allow-origin', allowAll ? '*' : origin);
    response.setHeader('vary', 'Origin');
  }

  if (!origin && allowAll) {
    response.setHeader('access-control-allow-origin', '*');
  }

  if (process.env.CORS_CREDENTIALS === 'true' && !allowAll) {
    response.setHeader('access-control-allow-credentials', 'true');
  }

  response.setHeader(
    'access-control-allow-methods',
    'GET,POST,PATCH,DELETE,OPTIONS',
  );
  response.setHeader(
    'access-control-allow-headers',
    'authorization,content-type,idempotency-key,x-correlation-id,x-request-id',
  );
  response.setHeader(
    'access-control-expose-headers',
    'x-correlation-id,x-request-id',
  );
  response.setHeader('access-control-max-age', '600');
}

function configuredOrigins() {
  const configured =
    process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGINS;
  if (configured) {
    return configured
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }
  return strictRuntime() ? [] : ['*'];
}

function strictRuntime() {
  return (
    process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging'
  );
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
