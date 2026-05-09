import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { RequestContextService } from './request-context.service';
import { redactSecrets } from './redaction';
import { StructuredLogger } from './structured-logger.service';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(
    private readonly context: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const normalized = normalizeException(exception);
    const body = redactSecrets({
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
      correlationId: this.context.correlationId(),
      timestamp: new Date().toISOString(),
    });

    this.logger.error({
      module: 'http',
      event: 'request_failed',
      status: normalized.status,
      details: body.details,
      error: exception,
    });

    response.status(normalized.status).json(body);
  }
}

type NormalizedException = {
  status: number;
  code: string;
  message: string;
  details: Record<string, unknown>;
};

function normalizeException(exception: unknown): NormalizedException {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const responseObject =
      typeof response === 'string' ? { message: response } : response;
    const record = isRecord(responseObject) ? responseObject : {};
    const message = messageFrom(record.message, exception.message);
    const code =
      typeof record.code === 'string'
        ? record.code
        : defaultCodeForStatus(status);

    return {
      status,
      code,
      message,
      details: omit(record, ['code', 'message', 'error', 'statusCode']),
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const status =
      exception.code === 'P2025'
        ? HttpStatus.NOT_FOUND
        : exception.code === 'P2002'
          ? HttpStatus.CONFLICT
          : HttpStatus.BAD_REQUEST;

    return {
      status,
      code: exception.code,
      message: defaultMessageForStatus(status),
      details: { meta: exception.meta },
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error',
    details: {},
  };
}

function defaultCodeForStatus(status: number) {
  if (status === HttpStatus.FORBIDDEN) return 'FORBIDDEN';
  if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
  if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
  if (status === HttpStatus.CONFLICT) return 'CONFLICT';
  if (status === HttpStatus.BAD_REQUEST) return 'BAD_REQUEST';
  return 'INTERNAL_SERVER_ERROR';
}

function defaultMessageForStatus(status: number) {
  if (status === HttpStatus.NOT_FOUND) return 'Resource not found';
  if (status === HttpStatus.CONFLICT) return 'Conflict';
  if (status === HttpStatus.BAD_REQUEST) return 'Bad request';
  return 'Internal server error';
}

function messageFrom(value: unknown, fallback: string) {
  if (Array.isArray(value)) return value.join('; ');
  return typeof value === 'string' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function omit(record: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  );
}
