import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export type RequestContext = {
  requestId: string;
  correlationId: string;
  actorId?: string;
};

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  run<T>(context: Partial<RequestContext>, callback: () => T): T {
    const requestId = context.requestId ?? `req_${randomUUID()}`;
    const correlationId = context.correlationId ?? requestId;

    return this.storage.run(
      {
        requestId,
        correlationId,
        actorId: context.actorId,
      },
      callback,
    );
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  requestId() {
    return this.get()?.requestId;
  }

  correlationId() {
    return this.get()?.correlationId;
  }

  actorId() {
    return this.get()?.actorId;
  }
}
