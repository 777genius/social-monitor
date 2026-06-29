import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { RequestCorrelationIdFactory } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetSummaryPolicyUseCase } from '../../features/get-summary-policy/get-summary-policy.use-case';
import { UpsertSummaryPolicyUseCase } from '../../features/upsert-summary-policy/upsert-summary-policy.use-case';
import {
  type GetSummaryPolicyResponseDto,
  UpsertSummaryPolicyRequestDto,
  type UpsertSummaryPolicyResponseDto,
} from './summary-policy.dto';

@ApiTags('summary-policies')
@Controller('interests/:interestId/summary-policy')
export class SummaryPolicyController {
  constructor(
    private readonly getSummaryPolicy: GetSummaryPolicyUseCase,
    private readonly upsertSummaryPolicy: UpsertSummaryPolicyUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
    private readonly requestCorrelationIds: RequestCorrelationIdFactory,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get summary policy for an interest.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Summary policy reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetSummaryPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryPolicyRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.getSummaryPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Put()
  @ApiOperation({ summary: 'Create or update summary policy for an interest.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Summary policy writes require owner or admin.',
  })
  async upsert(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: UpsertSummaryPolicyRequestDto,
  ): Promise<UpsertSummaryPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSummaryPolicyWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const result = await this.upsertSummaryPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
      language: body.language,
      format: body.format,
      tone: body.tone,
      maxKeyPoints: body.maxKeyPoints,
      includeRisks: body.includeRisks,
      includeSourceHighlights: body.includeSourceHighlights,
      customInstructions: body.customInstructions,
      correlationId: this.requestCorrelationIds.fromRequestId(requestId),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSummaryPolicyRead(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:summaries',
        operation: 'summary_policies.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'summary_policies.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeSummaryPolicyWrite(
    tenantId: TenantId,
    workspaceId: WorkspaceId,
    workspaceRoleHeader: string | undefined,
    authorizationHeader: string | undefined,
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'write:summaries',
        operation: 'summary_policies.set',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'summary_policies.set',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
