import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../observability/structured-logger.service';
import { ERPNextConfigService } from './erpnext.config';
import { ERPNextRequest, ERPNextResponse } from './erpnext.types';

@Injectable()
export class ERPNextClient {
  constructor(
    private readonly configService: ERPNextConfigService,
    private readonly logger: StructuredLogger,
  ) {}

  validateERPNextConnection(): Promise<ERPNextResponse> {
    return this.request({ method: 'GET', path: '/api/method/ping' });
  }

  async request(input: ERPNextRequest): Promise<ERPNextResponse> {
    const config = this.configService.validateRequiredForSync();
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    const url = new URL(input.path, config.baseUrl);

    try {
      const response = await fetch(url, {
        method: input.method,
        signal: controller.signal,
        headers: {
          Authorization: `token ${config.apiKey}:${config.apiSecret}`,
          'Content-Type': 'application/json',
          ...(input.idempotencyKey
            ? { 'Idempotency-Key': input.idempotencyKey }
            : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
      });
      const durationMs = Date.now() - startedAt;
      this.logger.log({
        module: 'erpnext',
        event: 'erpnext_http_request',
        duration: durationMs,
        status: response.status,
        details: { method: input.method, path: input.path },
      });

      const body = await readResponseBody(response);

      return {
        status: response.status,
        ok: response.ok,
        body,
        durationMs,
        errorCode: response.ok
          ? undefined
          : errorCodeForFailure(response.status, body),
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const timeoutError = controller.signal.aborted || isAbortError(error);
      const errorCode = timeoutError ? 'timeout' : 'connection_failed';
      this.logger.warn({
        module: 'erpnext',
        event: 'erpnext_http_request_failed',
        duration: durationMs,
        status: errorCode,
        details: { method: input.method, path: input.path },
      });
      return {
        status: 0,
        ok: false,
        body: null,
        durationMs,
        errorCode,
        errorMessage:
          error instanceof Error ? error.message : 'ERPNext request failed',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function errorCodeForFailure(status: number, body: unknown) {
  if (status === 408 || status === 504) return 'timeout';
  if (isDuplicateDocument(body)) return 'duplicate_document';
  if (status === 417) return 'validation_failed';
  return 'connection_failed';
}

function isDuplicateDocument(body: unknown) {
  if (!body || typeof body !== 'object') return false;

  const record = body as Record<string, unknown>;
  return ['exc_type', 'exception', 'exc'].some((key) => {
    const value = record[key];
    if (typeof value === 'string') {
      return value.includes('DuplicateEntryError');
    }
    return false;
  });
}
