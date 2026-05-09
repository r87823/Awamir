import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ApiErrorFilter } from './api-error.filter';
import { RequestCorrelationMiddleware } from './request-correlation.middleware';
import { RequestContextService } from './request-context.service';
import { RequestLoggingInterceptor } from './request-logging.interceptor';
import { StructuredLogger } from './structured-logger.service';

@Global()
@Module({
  providers: [
    RequestContextService,
    StructuredLogger,
    RequestCorrelationMiddleware,
    {
      provide: APP_FILTER,
      useClass: ApiErrorFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
  ],
  exports: [RequestContextService, StructuredLogger],
})
export class ObservabilityModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestCorrelationMiddleware).forRoutes('*');
  }
}
