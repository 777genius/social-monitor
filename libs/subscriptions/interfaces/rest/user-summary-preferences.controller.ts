import { Body, Controller, Get, Headers, Inject, Param, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type BearerRequestAuthorization,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { WORKSPACE_AUTHORIZATION_POLICY, type WorkspaceAuthorizationPolicyPort } from '@social-monitor/identity/ports';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetEffectiveUserSummaryPreferenceUseCase } from '../../features/get-effective-user-summary-preference/get-effective-user-summary-preference.use-case';
import { UpsertUserSummaryPreferenceUseCase } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.use-case';
import {
  GetEffectiveUserSummaryPreferenceResponseDto,
  UpsertInterestUserSummaryPreferenceRequestDto,
  UpsertUserSummaryPreferenceResponseDto,
} from './user-subscriptions.dto';

@ApiTags('user-summary-preferences')
@Controller('interests/:interestId/user-summary-preference')
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
  @ApiOperation({
    summary: 'Read the effective interest summary preference overlay for one user.',
  })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiOkResponse({ type: GetEffectiveUserSummaryPreferenceResponseDto })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'subscriptionId', required: false, type: String })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:summaries',
    workspaceRoleDescription:
      'Comma-separated workspace roles. User summary preference reads allow owner, admin, member or viewer.',
  })
  async getEffectiveInterestSummaryPreference(
    @Param('interestId') interestId: string,
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
      interestId,
      subscriptionId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Put()
  @ApiOperation({
    summary: 'Create or update the interest-level summary preference overlay for one user.',
  })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiOkResponse({ type: UpsertUserSummaryPreferenceResponseDto })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription:
      'Comma-separated workspace roles. User summary preference writes allow owner, admin or member.',
  })
  async upsertInterestSummaryPreference(
    @Param('interestId') interestId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: UpsertInterestUserSummaryPreferenceRequestDto,
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
      interestId,
      language: optionalRestField(body.language),
      format: optionalRestField(body.format),
      tone: optionalRestField(body.tone),
      maxKeyPoints: optionalRestField(body.maxKeyPoints),
      includeRisks: optionalRestField(body.includeRisks),
      includeSourceHighlights: optionalRestField(body.includeSourceHighlights),
      customInstructions: optionalRestField(body.customInstructions),
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

const optionalRestField = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);
