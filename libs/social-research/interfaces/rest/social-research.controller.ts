import { Body, Controller, Headers, Inject, Post } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WorkspaceRoleHeaderParser,
} from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import {
  DomainError,
  requireTenantScope,
  type TenantId,
  type WorkspaceId,
} from '@social-monitor/shared-kernel';

import { SocialResearchToolHandlers } from '../tools/social-research-tool-handlers';
import {
  ExplainSearchPlanRestRequestDto,
  ExplainSearchPlanRestResponseDto,
  ExplainSourceReadinessRestRequestDto,
  ExplainSourceReadinessRestResponseDto,
  FetchSocialThreadRestRequestDto,
  FetchSocialThreadRestResponseDto,
  ListSocialSourcesRestRequestDto,
  ListSocialSourcesRestResponseDto,
  RankSocialResultsRestRequestDto,
  RankSocialResultsRestResponseDto,
  SearchSocialRestRequestDto,
  SearchSocialRestResponseDto,
  type SocialResearchExecutionRestDto,
} from './social-research-rest.dto';

@ApiTags('social-research')
@Controller('social-research')
export class SocialResearchController {
  constructor(
    private readonly handlers: SocialResearchToolHandlers,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post('search')
  @ApiOperation({ summary: 'Execute source-agnostic social research through the SDK.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: SearchSocialRestResponseDto })
  async search(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: SearchSocialRestRequestDto,
  ): Promise<SearchSocialRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return {
      run: await this.handlers.searchSocial({
        ...body,
        execution: executionInputFor(scope, body.execution),
      }),
    };
  }

  @Post('explain-plan')
  @ApiOperation({ summary: 'Explain social research search lanes without provider calls.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: ExplainSearchPlanRestResponseDto })
  async explainPlan(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: ExplainSearchPlanRestRequestDto,
  ): Promise<ExplainSearchPlanRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return this.handlers.explainSearchPlan(body);
  }

  @Post('threads/fetch')
  @ApiOperation({ summary: 'Fetch a source thread through the SDK execution boundary.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: FetchSocialThreadRestResponseDto })
  async fetchThread(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: FetchSocialThreadRestRequestDto,
  ): Promise<FetchSocialThreadRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return {
      thread: await this.handlers.fetchThread({
        ...body,
        execution: executionInputFor(scope, body.execution),
      }),
    };
  }

  @Post('rank')
  @ApiOperation({ summary: 'Rank normalized social research items without provider calls.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: RankSocialResultsRestResponseDto })
  async rank(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: RankSocialResultsRestRequestDto,
  ): Promise<RankSocialResultsRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return {
      rankedItems: this.handlers.rankResults(body),
    };
  }

  @Post('sources/list')
  @ApiOperation({ summary: 'List social source capability and certification profiles.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: ListSocialSourcesRestResponseDto })
  async listSources(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: ListSocialSourcesRestRequestDto,
  ): Promise<ListSocialSourcesRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return this.handlers.listSocialSources(body);
  }

  @Post('sources/readiness')
  @ApiOperation({ summary: 'Explain social source readiness without provider calls.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Social research reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: ExplainSourceReadinessRestResponseDto })
  async explainSourceReadiness(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: ExplainSourceReadinessRestRequestDto,
  ): Promise<ExplainSourceReadinessRestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

    return this.handlers.explainSourceReadiness(body);
  }

  private async authorizeRead(
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
        requiredScope: 'read:feed',
        operation: 'social_research.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'feed.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const executionInputFor = (
  scope: { readonly tenantId: TenantId; readonly workspaceId: WorkspaceId },
  execution: SocialResearchExecutionRestDto | undefined,
) => {
  if (execution === undefined) {
    throw new DomainError('validation.failed', 'Social research execution is required');
  }

  return {
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    scanJobId: execution.scanJobId,
    correlationId: execution.correlationId,
    sourceBindingIdBySource: execution.sourceBindingIdBySource,
    cursorByLaneId: execution.cursorByLaneId,
  };
};
