import { Body, Controller, Headers, Inject, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { PlanInterestCoverageUseCase } from '../../features/plan-interest-coverage/plan-interest-coverage.use-case';
import {
  PlanInterestCoverageRequestDto,
  PlanInterestCoverageResponseDto,
  normalizePlanInterestCoverageRequest,
} from './interest-coverage-plan.dto';

@ApiTags('interest-coverage-plans')
@Controller('interests/:interestId/coverage-plan')
export class InterestCoveragePlanController {
  constructor(
    private readonly planInterestCoverage: PlanInterestCoverageUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Plan production-safe source bindings for an interest.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiParam({ name: 'interestId', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source planning reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: PlanInterestCoverageResponseDto })
  async plan(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: PlanInterestCoverageRequestDto,
  ): Promise<PlanInterestCoverageResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeSourcePlanningRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );

    const request = normalizePlanInterestCoverageRequest(body);
    const result = await this.planInterestCoverage.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      interestId,
      ...request,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSourcePlanningRead(
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
        requiredScope: 'read:interests',
        operation: 'interests.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'interests.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
