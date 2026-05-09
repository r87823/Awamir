import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OrderNumberGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async next(branchCode: string): Promise<string> {
    const datePart = compactDate(new Date());
    const prefix = `ORD-${branchCode}-${datePart}`;
    const count = await this.prisma.order.count({
      where: { orderNumber: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }
}

function compactDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
