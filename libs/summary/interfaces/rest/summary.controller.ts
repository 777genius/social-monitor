import { Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetSummaryUseCase } from '../../features/get-summary/get-summary.use-case';
import { ListSummariesUseCase } from '../../features/list-summaries/list-summaries.use-case';
import { RegenerateSummaryUseCase } from '../../features/regenerate-summary/regenerate-summary.use-case';
import type { RegenerateSummaryResponseDto } from './regenerate-summary.dto';
import type { ListSummariesResponseDto, SummaryResponseDto } from './summary.dto';

@ApiTags('summaries')
@Controller('summaries')
export class SummaryController {
  constructor(
    private readonly listSummaries: ListSummariesUseCase,
    private readonly getSummary: GetSummaryUseCase,
    private readonly regenerateSummary: RegenerateSummaryUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace summaries with cursor pagination.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiQuery({ name: 'topicId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Query('topicId') topicId: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListSummariesResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const result = await this.listSummaries.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId: normalizeTopicId(topicId),
      limit: parseLimit(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':summaryId')
  @ApiOperation({ summary: 'Get one tenant/workspace summary by id.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async get(
    @Param('summaryId') summaryId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
  ): Promise<SummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const result = await this.getSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Post(':summaryId/regenerations')
  @ApiOperation({ summary: 'Request regeneration for an existing summary.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async regenerate(
    @Param('summaryId') summaryId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<RegenerateSummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const result = await this.regenerateSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
      idempotencyKey,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number.NaN;
};

const normalizeTopicId = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};
