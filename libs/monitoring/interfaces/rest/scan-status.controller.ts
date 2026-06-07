import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetScanStatusUseCase } from '../../features/get-scan-status/get-scan-status.use-case';
import type { ScanStatusResponseDto } from './scan-status.dto';
import { buildScanStatusView } from './scan-status-view';

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
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<ScanStatusResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    return this.getScanStatus
      .execute({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        scanJobId,
      })
      .then((result) => {
        if (!result.ok) {
          throw result.error;
        }

        const view = buildScanStatusView({
          status: result.value.status,
          failureReason: result.value.failureReason,
        });

        return {
          scanJobId: result.value.scanJobId,
          sourceBindingId: result.value.sourceBindingId,
          scanPolicyId: result.value.scanPolicyId,
          status: result.value.status,
          userState: view.userState,
          failureClass: view.failureClass,
          operatorAction: view.operatorAction,
          requestedAt: result.value.requestedAt.toISOString(),
          enqueuedAt: result.value.enqueuedAt?.toISOString(),
          completedAt: result.value.completedAt?.toISOString(),
          failureReason: result.value.failureReason,
        };
      });
  }
}
