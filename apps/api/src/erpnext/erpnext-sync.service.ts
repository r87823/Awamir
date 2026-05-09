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
import { PrismaService } from '../prisma/prisma.service';
import { ERPNextClient } from './erpnext.client';
import {
  draftPaymentEntryContract,
  draftSalesInvoiceContract,
  salesOrderContract,
  submitPaymentEntryContract,
  submitSalesInvoiceContract,
} from './erpnext.contracts';
import { redactERPNextPayload } from './erpnext-redaction';
import { ERPNextResponse, PlaceholderSyncContract } from './erpnext.types';

@Injectable()
export class ERPNextSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: ERPNextClient,
    private readonly audit?: AuditService,
    private readonly events?: DomainEventBus,
    @Optional() private readonly requestContext?: RequestContextService,
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
      return existing;
    }

    return this.prisma.integrationOutbox.create({
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

    return this.prisma.integrationOutbox.update({
      where: { id: outboxId },
      data: {
        status: retryState.status,
        retryCount,
        nextRetryAt: retryState.nextRetryAt,
        lastError: null,
        lockedAt: null,
      },
    });
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
    const requestPayload = {
      method: 'POST',
      path: '/api/resource/Awamir Placeholder',
      idempotencyKey: outbox.idempotencyKey,
      body: outbox.payload,
    };

    const startedAt = new Date();
    try {
      const response = await this.client.request({
        method: 'POST',
        path: '/api/resource/Awamir Placeholder',
        idempotencyKey: outbox.idempotencyKey,
        body: {
          operation: outbox.operation,
          source_type: outbox.sourceType,
          source_id: outbox.sourceId,
          payload: outbox.payload,
        },
      });

      if (!response.ok) {
        await this.recordFailedAttempt(
          outbox,
          requestPayload,
          response,
          startedAt,
        );
        return this.markFailed(outbox, `HTTP_${response.status}`);
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
          errorCode: 'ERPNEXT_REQUEST_FAILED',
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
        errorCode: `HTTP_${response.status}`,
        errorMessage: 'ERPNext request failed',
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
        lastError: error,
        lockedAt: null,
        nextRetryAt: retryState.nextRetryAt,
      },
    });
    await this.applyFailedAccountingStatus(outbox, error);
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
