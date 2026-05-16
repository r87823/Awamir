import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ERPNextSyncOperation,
  ERPNextSyncStatus,
  IntegrationOutbox,
  Prisma,
} from '@prisma/client';
import { accountingStatusAfterCompletionCheck } from '../accounting/accounting-completion';
import { nextRetryState } from '../accounting/retry-backoff';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { RequestContextService } from '../observability/request-context.service';
import { StructuredLogger } from '../observability/structured-logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { ERPNextClient } from './erpnext.client';
import { ERPNextConfigService } from './erpnext.config';
import {
  draftPaymentEntryContract,
  draftSalesInvoiceContract,
  salesOrderContract,
  submitPaymentEntryContract,
  submitSalesInvoiceContract,
} from './erpnext.contracts';
import {
  ERPNextSyncValidationError,
  buildDraftPaymentEntryRequest,
  buildDraftSalesInvoiceRequest,
  buildSalesOrderRequest,
  buildSubmitDocumentRequest,
} from './erpnext.mapper';
import { redactERPNextPayload } from './erpnext-redaction';
import {
  ERPNextPreparedRequest,
  ERPNextResponse,
  PlaceholderSyncContract,
} from './erpnext.types';
import { ERPNextQueueScheduler } from './erpnext-queue-scheduler';

@Injectable()
export class ERPNextSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ERPNextClient,
    private readonly configService?: ERPNextConfigService,
    private readonly audit?: AuditService,
    private readonly events?: DomainEventBus,
    private readonly logger?: StructuredLogger,
    @Optional() private readonly requestContext?: RequestContextService,
    @Optional() private readonly queueScheduler?: ERPNextQueueScheduler,
  ) {}

  async validateERPNextConnection() {
    const requestPayload = { method: 'GET', path: '/api/method/ping' };
    const response = await this.client.validateERPNextConnection();

    await this.prisma.eRPNextSyncLog.create({
      data: {
        operation: ERPNextSyncOperation.VALIDATE_CONNECTION,
        status: response.ok
          ? ERPNextSyncStatus.SUCCEEDED
          : ERPNextSyncStatus.FAILED,
        correlationId: this.currentCorrelationId(),
        requestPayload: redactERPNextPayload(requestPayload),
        responsePayload: redactERPNextPayload(
          response.body,
        ) as Prisma.InputJsonValue,
        errorCode: response.ok ? null : `HTTP_${response.status}`,
        errorMessage: response.ok ? null : 'ERPNext validation failed',
        completedAt: new Date(),
      },
    });

    return { valid: response.ok, status: response.status, body: response.body };
  }

  createSalesOrder(orderId: string) {
    return this.enqueueContract(salesOrderContract(orderId));
  }

  createDraftSalesInvoice(orderId: string) {
    return this.enqueueContract(draftSalesInvoiceContract(orderId));
  }

  submitSalesInvoice(orderId: string) {
    return this.enqueueContract(submitSalesInvoiceContract(orderId));
  }

  createDraftPaymentEntry(paymentId: string) {
    return this.enqueueContract(draftPaymentEntryContract(paymentId));
  }

  submitPaymentEntry(paymentId: string) {
    return this.enqueueContract(submitPaymentEntryContract(paymentId));
  }

  async enqueueContract(contract: PlaceholderSyncContract) {
    const existing = await this.prisma.integrationOutbox.findUnique({
      where: { idempotencyKey: contract.idempotencyKey },
    });

    if (existing) {
      await this.scheduleOutboxWakeup(existing, 'existing');
      return existing;
    }

    const created = await this.prisma.integrationOutbox.create({
      data: {
        operation: contract.operation,
        idempotencyKey: contract.idempotencyKey,
        sourceType: contract.sourceType,
        sourceId: contract.sourceId,
        payload: contract.body as Prisma.InputJsonValue,
        erpnextDoctype: contract.erpnextDoctype,
        correlationId: this.currentCorrelationId(),
      },
    });
    await this.scheduleOutboxWakeup(created, 'created');
    return created;
  }

  async retrySync(outboxId: string) {
    const outbox = await this.prisma.integrationOutbox.findUnique({
      where: { id: outboxId },
    });

    if (!outbox) {
      throw new NotFoundException({ code: 'ERPNEXT_OUTBOX_NOT_FOUND' });
    }

    if (outbox.status === ERPNextSyncStatus.SUCCEEDED) {
      return outbox;
    }

    const retryCount = outbox.retryCount + 1;
    const retryState = nextRetryState(retryCount);

    const updated = await this.prisma.integrationOutbox.update({
      where: { id: outboxId },
      data: {
        status: retryState.status,
        retryCount,
        nextRetryAt: retryState.nextRetryAt,
        lastError: null,
        lockedAt: null,
      },
    });
    await this.scheduleOutboxWakeup(updated, 'retried');
    return updated;
  }

  async processOutbox(outboxId: string, now = new Date()) {
    const outbox = await this.prisma.integrationOutbox.findUnique({
      where: { id: outboxId },
    });

    if (
      !outbox ||
      outbox.status === ERPNextSyncStatus.SUCCEEDED ||
      outbox.status === ERPNextSyncStatus.DEAD_LETTER
    ) {
      return outbox;
    }

    if (outbox.nextRetryAt > now) {
      return outbox;
    }

    const locked = await this.lockOutbox(outbox);
    if (!locked) {
      return outbox;
    }

    return this.sendLockedOutbox(locked);
  }

  async processDueOutbox(now = new Date()) {
    const dueItems = await this.prisma.integrationOutbox.findMany({
      where: {
        status: { in: [ERPNextSyncStatus.PENDING, ERPNextSyncStatus.FAILED] },
        nextRetryAt: { lte: now },
      },
      orderBy: { createdAt: 'asc' },
      take: 25,
    });

    const results = [];
    for (const item of dueItems) {
      results.push(await this.processOutbox(item.id, now));
    }

    return results;
  }

  private async lockOutbox(outbox: IntegrationOutbox) {
    const result = await this.prisma.integrationOutbox.updateMany({
      where: {
        id: outbox.id,
        status: { in: [ERPNextSyncStatus.PENDING, ERPNextSyncStatus.FAILED] },
      },
      data: {
        status: ERPNextSyncStatus.PROCESSING,
        lockedAt: new Date(),
        lastAttemptAt: new Date(),
      },
    });

    if (result.count === 0) {
      return null;
    }

    return this.prisma.integrationOutbox.findUniqueOrThrow({
      where: { id: outbox.id },
    });
  }

  private async sendLockedOutbox(outbox: IntegrationOutbox) {
    const startedAt = new Date();
    let requestPayload: Record<string, unknown> = {
      operation: outbox.operation,
      idempotencyKey: outbox.idempotencyKey,
      sourceType: outbox.sourceType,
      sourceId: outbox.sourceId,
    };
    try {
      const idempotentSuccess = await this.localReferenceSuccess(outbox);
      if (idempotentSuccess) {
        return idempotentSuccess;
      }

      const prepared = await this.prepareERPNextRequest(outbox);
      requestPayload = prepared.requestPayload;
      const response = await this.client.request({
        method: prepared.method,
        path: prepared.path,
        idempotencyKey: outbox.idempotencyKey,
        body: prepared.body,
      });

      if (!response.ok) {
        await this.recordFailedAttempt(
          outbox,
          requestPayload,
          response,
          startedAt,
        );
        return this.markFailed(
          outbox,
          response.errorCode ?? `HTTP_${response.status}`,
        );
      }

      await this.prisma.eRPNextSyncLog.create({
        data: {
          outboxId: outbox.id,
          operation: outbox.operation,
          status: ERPNextSyncStatus.SUCCEEDED,
          correlationId: outbox.correlationId,
          requestPayload: redactERPNextPayload(
            requestPayload,
          ) as Prisma.InputJsonValue,
          responsePayload: redactERPNextPayload(
            response.body,
          ) as Prisma.InputJsonValue,
          startedAt,
          completedAt: new Date(),
        },
      });

      const updated = await this.prisma.integrationOutbox.update({
        where: { id: outbox.id },
        data: {
          status: ERPNextSyncStatus.SUCCEEDED,
          erpnextName: extractERPNextName(response.body),
          lastError: null,
          lockedAt: null,
        },
      });
      await this.applySuccessfulERPNextReference(updated);
      await this.events?.emit(
        domainEvent({
          name: 'ERPNextSyncSucceededEvent',
          entityType: 'integration_outbox',
          entityId: outbox.id,
          correlationId: outbox.correlationId ?? undefined,
          payload: {
            operation: outbox.operation,
            sourceType: outbox.sourceType,
            sourceId: outbox.sourceId,
            erpnextName: updated.erpnextName,
          },
        }),
      );
      return updated;
    } catch (error: unknown) {
      if (error instanceof ERPNextSyncValidationError) {
        await this.prisma.eRPNextSyncLog.create({
          data: {
            outboxId: outbox.id,
            operation: outbox.operation,
            status: ERPNextSyncStatus.FAILED,
            correlationId: outbox.correlationId,
            requestPayload: redactERPNextPayload(
              requestPayload,
            ) as Prisma.InputJsonValue,
            responsePayload: Prisma.JsonNull,
            errorCode: error.code,
            errorMessage: error.message,
            startedAt,
            completedAt: new Date(),
          },
        });
        return this.markFailed(outbox, error.code);
      }
      const message =
        error instanceof Error ? error.message : 'Unknown ERPNext error';
      await this.prisma.eRPNextSyncLog.create({
        data: {
          outboxId: outbox.id,
          operation: outbox.operation,
          status: ERPNextSyncStatus.FAILED,
          correlationId: outbox.correlationId,
          requestPayload: redactERPNextPayload(
            requestPayload,
          ) as Prisma.InputJsonValue,
          responsePayload: Prisma.JsonNull,
          errorCode: 'connection_failed',
          errorMessage: message,
          startedAt,
          completedAt: new Date(),
        },
      });

      return this.markFailed(outbox, message);
    }
  }

  private async recordFailedAttempt(
    outbox: IntegrationOutbox,
    requestPayload: Record<string, unknown>,
    response: ERPNextResponse,
    startedAt: Date,
  ) {
    await this.prisma.eRPNextSyncLog.create({
      data: {
        outboxId: outbox.id,
        operation: outbox.operation,
        status: ERPNextSyncStatus.FAILED,
        correlationId: outbox.correlationId,
        requestPayload: redactERPNextPayload(
          requestPayload,
        ) as Prisma.InputJsonValue,
        responsePayload: redactERPNextPayload(
          response.body,
        ) as Prisma.InputJsonValue,
        errorCode: response.errorCode ?? `HTTP_${response.status}`,
        errorMessage:
          response.errorMessage ??
          (response.errorCode
            ? `ERPNext ${response.errorCode}`
            : 'ERPNext request failed'),
        startedAt,
        completedAt: new Date(),
      },
    });
  }

  private async markFailed(outbox: IntegrationOutbox, error: string) {
    const retryState = nextRetryState(outbox.retryCount + 1);
    const updated = await this.prisma.integrationOutbox.update({
      where: { id: outbox.id },
      data: {
        status: retryState.status,
        retryCount: { increment: 1 },
        lastError: error,
        lockedAt: null,
        nextRetryAt: retryState.nextRetryAt,
      },
    });
    await this.applyFailedAccountingStatus(outbox, error);
    await this.scheduleOutboxWakeup(updated, 'failed');
    await this.events?.emit(
      domainEvent({
        name: 'ERPNextSyncFailedEvent',
        entityType: 'integration_outbox',
        entityId: outbox.id,
        correlationId: outbox.correlationId ?? undefined,
        payload: {
          operation: outbox.operation,
          sourceType: outbox.sourceType,
          sourceId: outbox.sourceId,
          error,
        },
      }),
    );
    return updated;
  }

  private async scheduleOutboxWakeup(
    outbox: IntegrationOutbox,
    reason: 'created' | 'existing' | 'retried' | 'failed',
  ) {
    await this.queueScheduler?.scheduleOutboxWakeup(outbox, reason);
  }

  private async applySuccessfulERPNextReference(outbox: IntegrationOutbox) {
    if (!outbox.erpnextName) return;

    if (outbox.sourceType === 'order') {
      if (!isUuid(outbox.sourceId)) return;
      if (outbox.operation === ERPNextSyncOperation.CREATE_SALES_ORDER) {
        await this.prisma.order.updateMany({
          where: { id: outbox.sourceId, deletedAt: null },
          data: {
            erpnextSalesOrderId: outbox.erpnextName,
            accountingStatus: 'SALES_ORDER_CREATED',
          },
        });
        await this.updateAccountingPostedIfComplete(outbox.sourceId);
      }
      if (
        outbox.operation === ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE
      ) {
        await this.prisma.order.updateMany({
          where: { id: outbox.sourceId, deletedAt: null },
          data: {
            erpnextSalesInvoiceId: outbox.erpnextName,
            accountingStatus: 'DRAFT_INVOICE_CREATED',
          },
        });
        await this.updateAccountingPostedIfComplete(outbox.sourceId);
      }
      if (outbox.operation === ERPNextSyncOperation.SUBMIT_SALES_INVOICE) {
        await this.prisma.order.updateMany({
          where: { id: outbox.sourceId, deletedAt: null },
          data: { accountingStatus: 'INVOICE_SUBMITTED' },
        });
        await this.updateAccountingPostedIfComplete(outbox.sourceId);
      }
    }

    if (outbox.sourceType === 'payment') {
      if (!isUuid(outbox.sourceId)) return;
      const payment = await this.prisma.payment.update({
        where: { id: outbox.sourceId },
        data: {
          erpnextPaymentEntryId: outbox.erpnextName,
          status: 'POSTED',
        },
      });
      await this.prisma.order.updateMany({
        where: { id: payment.orderId, deletedAt: null },
        data: { accountingStatus: 'PAYMENT_SUBMITTED' },
      });
      await this.updateAccountingPostedIfComplete(payment.orderId);
    }
  }

  private async applyFailedAccountingStatus(
    outbox: IntegrationOutbox,
    error: string,
  ) {
    const prisma = this.prisma as PrismaService & {
      order?: PrismaService['order'];
      payment?: PrismaService['payment'];
      auditLog?: PrismaService['auditLog'];
    };
    if (outbox.sourceType === 'order') {
      if (!isUuid(outbox.sourceId)) return;
      await prisma.order?.updateMany({
        where: { id: outbox.sourceId, deletedAt: null },
        data: { accountingStatus: 'SYNC_FAILED' },
      });
    }
    if (outbox.sourceType === 'payment') {
      if (!isUuid(outbox.sourceId)) return;
      const payment = await prisma.payment?.findUnique({
        where: { id: outbox.sourceId },
      });
      if (payment) {
        await prisma.order?.updateMany({
          where: { id: payment.orderId, deletedAt: null },
          data: { accountingStatus: 'SYNC_FAILED' },
        });
      }
    }

    void error;
    void prisma;
  }

  private async updateAccountingPostedIfComplete(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) return;
    const accountingStatus = accountingStatusAfterCompletionCheck(
      {
        erpnextSalesOrderId: order.erpnextSalesOrderId,
        erpnextSalesInvoiceId: order.erpnextSalesInvoiceId,
        accountingStatus: order.accountingStatus,
      },
      order.payments.map((payment) => ({
        erpnextPaymentEntryId: payment.erpnextPaymentEntryId,
        status: payment.status,
      })),
    );
    if (accountingStatus !== order.accountingStatus) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { accountingStatus },
      });
    }
  }

  private currentCorrelationId() {
    return this.requestContext?.correlationId() ?? randomUUID();
  }

  private async prepareERPNextRequest(
    outbox: IntegrationOutbox,
  ): Promise<ERPNextPreparedRequest> {
    const config = this.configService?.validateRequiredForSync() ?? {
      baseUrl: process.env.ERPNEXT_BASE_URL ?? 'http://127.0.0.1:0',
      apiKey: process.env.ERPNEXT_API_KEY ?? 'dev-key',
      apiSecret: process.env.ERPNEXT_API_SECRET ?? 'dev-secret',
      company: process.env.ERPNEXT_COMPANY ?? 'Awamir Plus',
      timeoutMs: Number(process.env.ERPNEXT_TIMEOUT_MS ?? 5000),
      defaultCustomer: process.env.ERPNEXT_DEFAULT_CUSTOMER,
      defaultWarehouse: process.env.ERPNEXT_DEFAULT_WAREHOUSE,
      receivableAccount: process.env.ERPNEXT_RECEIVABLE_ACCOUNT,
      incomeAccount: process.env.ERPNEXT_INCOME_ACCOUNT,
      cashAccount: process.env.ERPNEXT_CASH_ACCOUNT,
      cardAccount: process.env.ERPNEXT_CARD_ACCOUNT,
      transferAccount: process.env.ERPNEXT_TRANSFER_ACCOUNT,
      onlineAccount: process.env.ERPNEXT_ONLINE_ACCOUNT,
      creditAccount: process.env.ERPNEXT_CREDIT_ACCOUNT,
    };

    let prepared: Omit<ERPNextPreparedRequest, 'requestPayload'>;
    if (outbox.sourceType === 'order') {
      const order = await this.prisma.order.findFirst({
        where: { id: outbox.sourceId, deletedAt: null },
        include: { items: true },
      });
      if (!order) {
        throw new ERPNextSyncValidationError(
          'validation_failed',
          'Order is required for ERPNext sync',
          { orderId: outbox.sourceId },
        );
      }
      if (outbox.operation === ERPNextSyncOperation.CREATE_SALES_ORDER) {
        prepared = buildSalesOrderRequest(order, config);
      } else if (
        outbox.operation === ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE
      ) {
        prepared = buildDraftSalesInvoiceRequest(order, config);
      } else if (
        outbox.operation === ERPNextSyncOperation.SUBMIT_SALES_INVOICE
      ) {
        const invoiceName = order.erpnextSalesInvoiceId;
        if (!invoiceName) {
          throw new ERPNextSyncValidationError(
            'validation_failed',
            'ERPNext sales invoice reference is required before submit',
          );
        }
        prepared = buildSubmitDocumentRequest('Sales Invoice', invoiceName);
      } else {
        throw new ERPNextSyncValidationError(
          'validation_failed',
          `Unsupported order sync operation ${outbox.operation}`,
        );
      }
    } else if (outbox.sourceType === 'payment') {
      const payment = await this.prisma.payment.findFirst({
        where: { id: outbox.sourceId, cancelledAt: null },
        include: { order: true },
      });
      if (!payment) {
        throw new ERPNextSyncValidationError(
          'validation_failed',
          'Payment is required for ERPNext sync',
          { paymentId: outbox.sourceId },
        );
      }
      if (
        outbox.operation === ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY
      ) {
        prepared = buildDraftPaymentEntryRequest(payment, config);
      } else if (
        outbox.operation === ERPNextSyncOperation.SUBMIT_PAYMENT_ENTRY
      ) {
        const paymentEntryName = payment.erpnextPaymentEntryId;
        if (!paymentEntryName) {
          throw new ERPNextSyncValidationError(
            'validation_failed',
            'ERPNext payment entry reference is required before submit',
          );
        }
        prepared = buildSubmitDocumentRequest(
          'Payment Entry',
          paymentEntryName,
        );
      } else {
        throw new ERPNextSyncValidationError(
          'validation_failed',
          `Unsupported payment sync operation ${outbox.operation}`,
        );
      }
    } else {
      throw new ERPNextSyncValidationError(
        'validation_failed',
        `Unsupported ERPNext source type ${outbox.sourceType}`,
      );
    }

    return {
      ...prepared,
      requestPayload: {
        method: prepared.method,
        path: prepared.path,
        idempotencyKey: outbox.idempotencyKey,
        body: prepared.body,
      },
    };
  }

  private async localReferenceSuccess(outbox: IntegrationOutbox) {
    const erpnextName = await this.localERPNextReference(outbox);
    if (!erpnextName) return null;

    this.logger?.log({
      module: 'erpnext',
      event: 'erpnext_outbox_idempotent_local_reference',
      entityType: 'integration_outbox',
      entityId: outbox.id,
      status: 'SUCCEEDED',
      details: {
        operation: outbox.operation,
        sourceType: outbox.sourceType,
        sourceId: outbox.sourceId,
      },
    });

    await this.prisma.eRPNextSyncLog.create({
      data: {
        outboxId: outbox.id,
        operation: outbox.operation,
        status: ERPNextSyncStatus.SUCCEEDED,
        correlationId: outbox.correlationId,
        requestPayload: {
          idempotencyKey: outbox.idempotencyKey,
          localReference: erpnextName,
        },
        responsePayload: { data: { name: erpnextName }, idempotent: true },
        startedAt: new Date(),
        completedAt: new Date(),
      },
    });

    return this.prisma.integrationOutbox.update({
      where: { id: outbox.id },
      data: {
        status: ERPNextSyncStatus.SUCCEEDED,
        erpnextName,
        lastError: null,
        lockedAt: null,
      },
    });
  }

  private async localERPNextReference(outbox: IntegrationOutbox) {
    if (outbox.sourceType === 'order') {
      if (!isUuid(outbox.sourceId)) return null;
      const order = await this.prisma.order.findUnique({
        where: { id: outbox.sourceId },
        select: {
          erpnextSalesOrderId: true,
          erpnextSalesInvoiceId: true,
        },
      });
      if (!order) return null;
      if (outbox.operation === ERPNextSyncOperation.CREATE_SALES_ORDER) {
        return order.erpnextSalesOrderId;
      }
      if (
        outbox.operation === ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE
      ) {
        return order.erpnextSalesInvoiceId;
      }
    }
    if (outbox.sourceType === 'payment') {
      if (!isUuid(outbox.sourceId)) return null;
      if (
        outbox.operation !== ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY
      ) {
        return null;
      }
      const payment = await this.prisma.payment.findUnique({
        where: { id: outbox.sourceId },
        select: { erpnextPaymentEntryId: true },
      });
      return payment?.erpnextPaymentEntryId ?? null;
    }
    return null;
  }
}

function extractERPNextName(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const data = record.data;

  if (data && typeof data === 'object' && 'name' in data) {
    const name = (data as Record<string, unknown>).name;
    return typeof name === 'string' ? name : null;
  }

  return typeof record.name === 'string' ? record.name : null;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
