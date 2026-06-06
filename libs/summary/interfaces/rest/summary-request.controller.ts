import { Controller, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import type { RequestSummaryResponseDto } from './request-summary.dto';

@ApiTags('summaries')
@Controller('topics/:topicId/summary-requests')
export class SummaryRequestController {
  constructor(private readonly requestSummary: RequestSummaryUseCase) {}

  @Post()
  @ApiOperation({ summary: 'Request a summary for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<RequestSummaryResponseDto> {
    const result = await this.requestSummary.execute({
      tenantId: tenantId(tenantHeader),
      workspaceId: workspaceId(workspaceHeader),
      topicId,
      idempotencyKey,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
