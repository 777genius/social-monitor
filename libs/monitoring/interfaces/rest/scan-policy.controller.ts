import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { SetScanPolicyUseCase } from '../../features/set-scan-policy/set-scan-policy.use-case';
import { SetScanPolicyRequestDto, type SetScanPolicyResponseDto } from './set-scan-policy.dto';

@ApiTags('scan-policies')
@Controller('source-bindings/:sourceBindingId/scan-policy')
export class ScanPolicyController {
  constructor(private readonly setScanPolicy: SetScanPolicyUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Set scan policy for a source binding.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Param('sourceBindingId') sourceBindingId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: SetScanPolicyRequestDto,
  ): Promise<SetScanPolicyResponseDto> {
    return this.setScanPolicy
      .execute({
        tenantId: tenantId(tenantHeader),
        workspaceId: workspaceId(workspaceHeader),
        sourceBindingId,
        intervalSeconds: body.intervalSeconds,
        freshnessSeconds: body.freshnessSeconds,
        retryBudget: body.retryBudget,
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
