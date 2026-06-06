import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { GetSummaryJobStatusUseCase } from '../../features/get-summary-job-status/get-summary-job-status.use-case';
import type { SummaryJobStatusResponseDto } from './summary-job-status.dto';

@ApiTags('summaries')
@Controller('summary-jobs')
export class SummaryJobController {
  constructor(private readonly getSummaryJobStatus: GetSummaryJobStatusUseCase) {}

  @Get(':summaryJobId/status')
  @ApiOperation({ summary: 'Get summary job status and safe timeline.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async getStatus(
    @Param('summaryJobId') summaryJobId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
  ): Promise<SummaryJobStatusResponseDto> {
    const result = await this.getSummaryJobStatus.execute({
      tenantId: tenantId(tenantHeader),
      workspaceId: workspaceId(workspaceHeader),
      summaryJobId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
