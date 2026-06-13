import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { RecordSummaryFeedbackUseCase } from '../../features/record-summary-feedback/record-summary-feedback.use-case';
import type { RecordSummaryFeedbackResponseDto } from './summary-feedback.dto';
import { RecordSummaryFeedbackRequestDto } from './summary-feedback.dto';

@ApiTags('summaries')
@Controller('summaries/:summaryId/feedback')
export class SummaryFeedbackController {
  constructor(
    private readonly recordSummaryFeedback: RecordSummaryFeedbackUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Record classified feedback for a summary without mutating the artifact.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Summary feedback allows owner, admin, member or viewer.',
  })
  @ApiHeader({ name: 'x-actor-id', required: true })
  @ApiHeader({ name: 'idempotency-key', required: true })
  async create(
    @Param('summaryId') summaryId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('x-actor-id') actorHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: RecordSummaryFeedbackRequestDto,
  ): Promise<RecordSummaryFeedbackResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'summary_feedback.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.recordSummaryFeedback.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
      idempotencyKey,
      submittedBy: actorHeader ?? '',
      rating: body.rating,
      category: body.category,
      comment: body.comment,
      citationId: body.citationId,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
