import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { StructuredLogger } from './structured-logger.service';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = Date.now();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    let errorStatus: number | undefined;

    return next.handle().pipe(
      catchError((error: unknown) => {
        errorStatus = statusFromError(error);
        return throwError(() => error);
      }),
      finalize(() => {
        this.logger.log({
          module: 'http',
          event: 'request_completed',
          duration: Date.now() - startedAt,
          status: errorStatus ?? response.statusCode,
          details: {
            method: request.method,
            path: request.originalUrl ?? request.url,
          },
        });
      }),
    );
  }
}

function statusFromError(error: unknown): number | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'getStatus' in error &&
    typeof error.getStatus === 'function'
  ) {
    return error.getStatus();
  }

  return undefined;
}
