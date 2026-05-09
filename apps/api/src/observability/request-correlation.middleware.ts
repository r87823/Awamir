import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  constructor(private readonly context: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const requestId =
      headerValue(request, 'x-request-id') ?? `req_${randomUUID()}`;
    const correlationId = headerValue(request, 'x-correlation-id') ?? requestId;
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
