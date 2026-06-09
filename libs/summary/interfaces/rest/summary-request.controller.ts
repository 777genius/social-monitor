import { Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { RequestSummaryUseCase } from '../../features/request-summary/request-summary.use-case';
import type { RequestSummaryResponseDto } from './request-summary.dto';

@ApiTags('summaries')
@Controller('topics/:topicId/summary-requests')
export class SummaryRequestController {
  constructor(
    private readonly requestSummary: RequestSummaryUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Request a summary for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. Summary requests require owner, admin or member.' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
  ): Promise<RequestSummaryResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'summary_requests.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.requestSummary.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
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
