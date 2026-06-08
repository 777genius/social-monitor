import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { ListScanDeadLettersUseCase } from '../../features/list-scan-dead-letters/list-scan-dead-letters.use-case';
import type { ListScanDeadLettersResponseDto } from './scan-dead-letter.dto';

@ApiTags('ingestion')
@Controller('ingestion/scan-dead-letters')
export class ScanDeadLetterController {
  constructor(private readonly listScanDeadLetters: ListScanDeadLettersUseCase) {}

  @Get()
  @ApiOperation({ summary: 'List support-safe scan dead letters for the tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
  ): Promise<ListScanDeadLettersResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const result = await this.listScanDeadLetters.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parseLimit(limitQuery),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseLimit = (limitQuery: string | undefined): number | undefined => {
  if (limitQuery === undefined || limitQuery.trim().length === 0) {
    return undefined;
  }

  return Number(limitQuery);
};
