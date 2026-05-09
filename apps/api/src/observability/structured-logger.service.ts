import { Injectable, Logger } from '@nestjs/common';
import { RequestContextService } from './request-context.service';
import { redactSecrets } from './redaction';

export type StructuredLogInput = {
  requestId?: string;
  correlationId?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  module?: string;
  event: string;
  duration?: number;
  status?: number | string;
  details?: Record<string, unknown>;
};

@Injectable()
export class StructuredLogger {
  private readonly logger = new Logger('AwamirApi');

  constructor(private readonly context: RequestContextService) {}

  log(input: StructuredLogInput) {
    this.logger.log(this.withContext(input));
  }

  warn(input: StructuredLogInput) {
    this.logger.warn(this.withContext(input));
  }

  error(input: StructuredLogInput & { error?: unknown }) {
    this.logger.error(this.withContext(input));
  }

  private withContext(input: StructuredLogInput & { error?: unknown }) {
    const context = this.context.get();
    const errorMessage =
      input.error instanceof Error ? input.error.message : input.error;

    return redactSecrets({
      requestId: input.requestId ?? context?.requestId,
      correlationId: input.correlationId ?? context?.correlationId,
      actorId: input.actorId ?? context?.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      module: input.module,
      event: input.event,
      duration: input.duration,
      status: input.status,
      details: input.details,
      error: errorMessage,
    });
  }
}
