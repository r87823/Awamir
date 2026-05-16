import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthRateLimiter } from './auth-rate-limiter.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [AuditModule, PrismaModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimiter],
  exports: [AuthService],
})
export class AuthModule {}
