import { of, throwError } from 'rxjs';
import { RequestContextService } from './request-context.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { redactSecrets } from './redaction';

describe('observability helpers', () => {
  it('propagates request context with AsyncLocalStorage', () => {
    const context = new RequestContextService();

    context.run(
      {
        requestId: 'req-test',
        correlationId: 'corr-test',
        actorId: 'actor-test',
      },
      () => {
        expect(context.get()).toEqual({
          requestId: 'req-test',
          correlationId: 'corr-test',
          actorId: 'actor-test',
        });
      },
    );
  });

  it('redacts secrets recursively', () => {
    expect(
      redactSecrets({
        Authorization: 'token abc',
        nested: {
          api_secret: 'secret',
          safe: 'visible',
        },
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      nested: {
        api_secret: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('logs completed requests without throwing', () => {
    const logger = { log: jest.fn() };
    const interceptor = new RequestLoggingInterceptor(logger as never);
    const context = executionContext();

    interceptor
      .intercept(context as never, { handle: () => of({ ok: true }) })
      .subscribe();

    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'request_completed',
        status: 200,
      }),
    );
  });

  it('logs failed requests and rethrows', () => {
    const logger = { log: jest.fn() };
    const interceptor = new RequestLoggingInterceptor(logger as never);
    const error = { getStatus: () => 403 };

    let thrown: unknown;
    interceptor
      .intercept(executionContext() as never, {
        handle: () => throwError(() => error),
      })
      .subscribe({
        error: (caught) => {
          thrown = caught;
        },
      });

    expect(thrown).toBe(error);
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'request_completed',
        status: 403,
      }),
    );
  });
});

function executionContext() {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: '/test',
        url: '/test',
      }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  };
}
