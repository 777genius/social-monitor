import { Body, Controller, Get, Headers, Inject, Param, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WorkspaceRoleHeaderParser,
} from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type BearerRequestAuthorization,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetEffectiveUserSummaryPreferenceUseCase } from '../../features/get-effective-user-summary-preference/get-effective-user-summary-preference.use-case';
import { UpsertUserSummaryPreferenceUseCase } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.use-case';
import {
  type GetEffectiveUserSummaryPreferenceResponseDto,
  UpsertTopicUserSummaryPreferenceRequestDto,
  type UpsertUserSummaryPreferenceResponseDto,
} from './user-subscriptions.dto';

@ApiTags('user-summary-preferences')
@Controller('topics/:topicId/user-summary-preference')
export class UserSummaryPreferencesController {
  constructor(
    private readonly getEffectiveUserSummaryPreference: GetEffectiveUserSummaryPreferenceUseCase,
    private readonly upsertUserSummaryPreference: UpsertUserSummaryPreferenceUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Read the effective topic summary preference overlay for one user.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'subscriptionId', required: false, type: String })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. User summary preference reads allow owner, admin, member or viewer.',
  })
  async getEffectiveTopicSummaryPreference(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('subscriptionId') subscriptionId: string | undefined,
  ): Promise<GetEffectiveUserSummaryPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeSummaryRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const targetUserId = resolveUserOwnedTarget(
      userId ?? '',
      authorization,
      'Bearer JWT user cannot access another user summary preference',
    );

    const result = await this.getEffectiveUserSummaryPreference.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      topicId,
      subscriptionId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Put()
  @ApiOperation({ summary: 'Create or update the topic-level summary preference overlay for one user.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. User summary preference writes allow owner, admin or member.',
  })
  async upsertTopicSummaryPreference(
    @Param('topicId') topicId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: UpsertTopicUserSummaryPreferenceRequestDto,
  ): Promise<UpsertUserSummaryPreferenceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeSummaryWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const targetUserId = resolveUserOwnedTarget(
      body.userId,
      authorization,
      'Bearer JWT user cannot write another user summary preference',
    );

    const result = await this.upsertUserSummaryPreference.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      topicId,
      language: body.language,
      format: body.format,
      tone: body.tone,
      maxKeyPoints: body.maxKeyPoints,
      includeRisks: body.includeRisks,
      includeSourceHighlights: body.includeSourceHighlights,
      customInstructions: body.customInstructions,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeSummaryRead(
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
        operation: 'user_summary_preferences.read',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'user_summary_preferences.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }

  private async authorizeSummaryWrite(
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
        operation: 'user_summary_preferences.set',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'user_summary_preferences.set',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }
}

const resolveUserOwnedTarget = (
  requestedUserId: string,
  authorization: BearerRequestAuthorization | undefined,
  denialMessage: string,
): string => {
  if (authorization?.actorType !== 'user') {
    return requestedUserId;
  }

  if (requestedUserId.trim() !== authorization.userId) {
    throw new DomainError('authorization.denied', denialMessage);
  }

  return authorization.userId;
};
