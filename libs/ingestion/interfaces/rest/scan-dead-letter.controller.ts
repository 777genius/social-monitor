import { Controller, Get, Headers, Inject, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import { parseOptionalPaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { ListScanDeadLettersUseCase } from '../../features/list-scan-dead-letters/list-scan-dead-letters.use-case';
import type { ListScanDeadLettersResponseDto } from './scan-dead-letter.dto';

@ApiTags('ingestion')
@Controller('ingestion/scan-dead-letters')
export class ScanDeadLetterController {
  constructor(
    private readonly listScanDeadLetters: ListScanDeadLettersUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List support-safe scan dead letters for the tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Scan dead-letter inspection allows owner or admin.',
  })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
  ): Promise<ListScanDeadLettersResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'scan_dead_letters.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.listScanDeadLetters.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parseOptionalPaginationLimit(limitQuery, {
        invalidMessage: 'Dead letter limit must be an integer between 1 and 100',
      }),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
