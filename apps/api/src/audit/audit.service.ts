import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type AuditInput = {
  action: string;
  actorId?: string;
  entityType: string;
  entityId?: string;
  payload?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: input.payload ?? Prisma.JsonNull,
      },
    });
  }
}
