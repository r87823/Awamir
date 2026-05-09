import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type NotificationInput = {
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId?: string;
  correlationId: string;
};

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async createOnce(input: NotificationInput) {
    const existing = await this.prisma.notification.findFirst({
      where: {
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        body: { contains: `[${input.correlationId}]` },
      },
    });
    if (existing) return existing;

    return this.prisma.notification.create({
      data: {
        type: input.type,
        title: input.title,
        body: `${input.body} [${input.correlationId}]`,
        entityType: input.entityType,
        entityId: input.entityId ?? '',
      },
    });
  }
}
