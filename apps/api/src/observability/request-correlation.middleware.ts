import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { bearerToken, verifyAuthToken } from '../auth/jwt';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const requestId =
      headerValue(request, 'x-request-id') ?? `req_${randomUUID()}`;
    const correlationId = headerValue(request, 'x-correlation-id') ?? requestId;
    const tokenPayload = verifyAuthToken(
      bearerToken(request.headers.authorization),
    );
    if (tokenPayload) {
      setHeaderFromToken(request, 'x-actor-id', tokenPayload.actorId);
      setHeaderFromToken(
        request,
        'x-permissions',
        tokenPayload.permissions.join(','),
      );
      setHeaderFromToken(request, 'x-branch-id', tokenPayload.branchId);
      setHeaderFromToken(request, 'x-driver-id', tokenPayload.driverId);
      setHeaderFromToken(
        request,
        'x-department-ids',
        tokenPayload.departmentIds.join(','),
      );
    }
    const actorId =
      headerValue(request, 'x-actor-id') ?? headerValue(request, 'x-driver-id');

    response.setHeader('x-request-id', requestId);
    response.setHeader('x-correlation-id', correlationId);

    this.context.run({ requestId, correlationId, actorId }, next);
  }
}

function headerValue(request: Request, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function setHeaderFromToken(
  request: Request,
  key: string,
  value: string | undefined,
) {
  if (!value) return;
  request.headers[key] = value;
}
