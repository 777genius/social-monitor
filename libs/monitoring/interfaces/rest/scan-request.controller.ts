import { Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { RequestScanUseCase } from '../../features/request-scan/request-scan.use-case';
import type { RequestScanResponseDto } from './request-scan.dto';

@ApiTags('scan-requests')
@Controller('source-bindings/:sourceBindingId/scan-requests')
export class ScanRequestController {
  constructor(private readonly requestScan: RequestScanUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Request a scan for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<RequestScanResponseDto> {
    return this.requestScan
      .execute({
        tenantId: tenantId(tenantHeader),
        workspaceId: workspaceId(workspaceHeader),
        sourceBindingId,
        idempotencyKey,
        correlationId: requestId ?? crypto.randomUUID(),
      })
      .then((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return result.value;
      });
  }
}
