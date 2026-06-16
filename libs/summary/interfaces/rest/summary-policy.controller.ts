import { Body, Controller, Get, Headers, Inject, Param, Put } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { GetSummaryPolicyUseCase } from '../../features/get-summary-policy/get-summary-policy.use-case';
import { UpsertSummaryPolicyUseCase } from '../../features/upsert-summary-policy/upsert-summary-policy.use-case';
import {
  type GetSummaryPolicyResponseDto,
  UpsertSummaryPolicyRequestDto,
  type UpsertSummaryPolicyResponseDto,
} from './summary-policy.dto';

@ApiTags('summary-policies')
@Controller('topics/:topicId/summary-policy')
export class SummaryPolicyController {
  constructor(
    private readonly getSummaryPolicy: GetSummaryPolicyUseCase,
    private readonly upsertSummaryPolicy: UpsertSummaryPolicyUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get summary policy for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Summary policy reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<GetSummaryPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'summary_policies.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.getSummaryPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Put()
  @ApiOperation({ summary: 'Create or update summary policy for a topic.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Summary policy writes require owner or admin.',
  })
  async upsert(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: UpsertSummaryPolicyRequestDto,
  ): Promise<UpsertSummaryPolicyResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'summary_policies.set',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.upsertSummaryPolicy.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      topicId,
      language: body.language,
      format: body.format,
      tone: body.tone,
      maxKeyPoints: body.maxKeyPoints,
      includeRisks: body.includeRisks,
      includeSourceHighlights: body.includeSourceHighlights,
      customInstructions: body.customInstructions,
      correlationId: requestId ?? crypto.randomUUID(),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
