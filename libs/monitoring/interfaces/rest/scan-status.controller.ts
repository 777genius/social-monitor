import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import type { ScanStatusResponseDto } from './scan-status.dto';

@ApiTags('scan-requests')
@Controller('scan-requests/:scanJobId/status')
export class ScanStatusController {
  constructor(private readonly getScanStatus: GetScanStatusUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Get current scan job status.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  get(
    @Param('scanJobId') scanJobId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
  ): Promise<ScanStatusResponseDto> {
    return this.getScanStatus
      .execute({
        tenantId: tenantId(tenantHeader),
        workspaceId: workspaceId(workspaceHeader),
        scanJobId,
      })
      .then((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return {
          scanJobId: result.value.scanJobId,
          sourceBindingId: result.value.sourceBindingId,
          scanPolicyId: result.value.scanPolicyId,
          status: result.value.status,
          requestedAt: result.value.requestedAt.toISOString(),
          enqueuedAt: result.value.enqueuedAt?.toISOString(),
        };
      });
  }
}
