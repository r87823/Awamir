import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ERPNextSyncService } from './erpnext-sync.service';

@UseGuards(PermissionsGuard)
@RequirePermissions('erpnext-sync:manage')
@Controller('erpnext')
export class ERPNextController {
  constructor(private readonly syncService: ERPNextSyncService) {}

  @Post('validate-connection')
  validateConnection() {
    return this.syncService.validateERPNextConnection();
  }

  @Post('sync/:outboxId/retry')
  retry(@Param('outboxId') outboxId: string) {
    return this.syncService.retrySync(outboxId);
  }
}
