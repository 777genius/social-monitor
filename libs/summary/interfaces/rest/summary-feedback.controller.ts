import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type ApiKeyRequestAuthorization,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { ListSummaryFeedbackUseCase } from '../../features/list-summary-feedback/list-summary-feedback.use-case';
import { RecordSummaryFeedbackUseCase } from '../../features/record-summary-feedback/record-summary-feedback.use-case';
import type {
  ListSummaryFeedbackResponseDto,
  RecordSummaryFeedbackResponseDto,
} from './summary-feedback.dto';
import { RecordSummaryFeedbackRequestDto } from './summary-feedback.dto';

@ApiTags('summaries')
@Controller('summaries/:summaryId/feedback')
export class SummaryFeedbackController {
  constructor(
    private readonly listSummaryFeedback: ListSummaryFeedbackUseCase,
    private readonly recordSummaryFeedback: RecordSummaryFeedbackUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List classified feedback for one summary with cursor pagination.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Summary feedback reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Param('summaryId') summaryId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListSummaryFeedbackResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryFeedbackRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.listSummaryFeedback.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
      limit: parseLimit(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

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
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-actor-id') actorHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: RecordSummaryFeedbackRequestDto,
  ): Promise<RecordSummaryFeedbackResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeSummaryFeedbackWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.recordSummaryFeedback.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      summaryId,
      idempotencyKey,
      submittedBy: actorHeader ?? authorization?.apiKeyId ?? '',
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

  private async authorizeSummaryFeedbackRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<ApiKeyRequestAuthorization | undefined> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      return this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:summaries',
        operation: 'summary_feedback.read',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'summary_feedback.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }

  private async authorizeSummaryFeedbackWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<ApiKeyRequestAuthorization | undefined> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      return this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'write:summaries',
        operation: 'summary_feedback.create',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'summary_feedback.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }
}

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number.NaN;
};
