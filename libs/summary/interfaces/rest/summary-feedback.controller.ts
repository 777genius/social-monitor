import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type BearerRequestAuthorization,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { parsePaginationLimit, RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
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
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List classified feedback for one summary with cursor pagination.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Summary feedback reads allow owner, admin, member or viewer.',
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
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: 'Summary feedback page limit must be between 1 and 100',
      }),
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
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Summary feedback allows owner, admin, member or viewer.',
  })
  @ApiHeader({
    name: 'x-actor-id',
    required: false,
    description: 'Optional actor id. API-key requests fall back to the API key id when omitted.',
  })
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
      submittedBy: actorHeader ?? authorization?.actorId ?? '',
      rating: body.rating,
      category: body.category,
      comment: body.comment,
      citationId: body.citationId,
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
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
  ): Promise<BearerRequestAuthorization | undefined> {
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
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
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
  ): Promise<BearerRequestAuthorization | undefined> {
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
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }
}
