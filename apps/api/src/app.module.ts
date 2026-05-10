import { Module } from '@nestjs/common';
import { AccountingModule } from './accounting/accounting.module';
import { AuthModule } from './auth/auth.module';
import { CashboxesModule } from './cashboxes/cashboxes.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ERPNextModule } from './erpnext/erpnext.module';
import { FulfillmentModule } from './fulfillment/fulfillment.module';
import { HealthController } from './health/health.controller';
import { MasterDataModule } from './master-data/master-data.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { ObservabilityModule } from './observability/observability.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ObservabilityModule,
    AuthModule,
    PrismaModule,
    MasterDataModule,
    DeliveryModule,
    FulfillmentModule,
    ERPNextModule,
    OrdersModule,
    PaymentsModule,
    CashboxesModule,
    AccountingModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
