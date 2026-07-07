import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
  type BearerRequestAuthorization,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import { WORKSPACE_AUTHORIZATION_POLICY, type WorkspaceAuthorizationPolicyPort } from '@social-monitor/identity/ports';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { ActivateInterestSourceUseCase } from '../../features/activate-interest-source/activate-interest-source.use-case';
import { CreateUserSubscriptionUseCase } from '../../features/create-user-subscription/create-user-subscription.use-case';
import { ListUserSubscriptionsUseCase } from '../../features/list-user-subscriptions/list-user-subscriptions.use-case';
import { UpsertUserSummaryPreferenceUseCase } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.use-case';
import {
  CreateUserSubscriptionRequestDto,
  type CreateUserSubscriptionResponseDto,
  ActivateInterestSourceRequestDto,
  type ActivateInterestSourceResponseDto,
  type ListUserSubscriptionsResponseDto,
  UpsertUserSummaryPreferenceRequestDto,
  type UpsertUserSummaryPreferenceResponseDto,
} from './user-subscriptions.dto';

@ApiTags('user-subscriptions')
@Controller('user-subscriptions')
export class UserSubscriptionsController {
  constructor(
    private readonly activateInterestSource: ActivateInterestSourceUseCase,
    private readonly createUserSubscription: CreateUserSubscriptionUseCase,
    private readonly listUserSubscriptions: ListUserSubscriptionsUseCase,
    private readonly upsertUserSummaryPreference: UpsertUserSummaryPreferenceUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post('activate-source')
  @ApiOperation({
    summary: 'Create a user subscription and activate its monitoring source pipeline.',
  })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:interests',
    workspaceRoleDescription: 'Comma-separated workspace roles. Source activation allows owner, admin or member.',
  })
  async activateSource(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: ActivateInterestSourceRequestDto,
  ): Promise<ActivateInterestSourceResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const targetUserId = resolveUserOwnedTarget(body.userId, authorization);

    const result = await this.activateInterestSource.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      providerKey: body.providerKey,
      targetKind: body.targetKind,
      targetValue: body.targetValue,
      targetConfig: body.targetConfig,
      schedule: {
        recipientKey: body.schedule.recipientKey,
        channel: body.schedule.channel,
        intervalSeconds: body.schedule.intervalSeconds,
        includeNoSignal: body.schedule.includeNoSignal,
        nextRunAt: body.schedule.nextRunAt === undefined ? undefined : parseDate(body.schedule.nextRunAt, 'nextRunAt'),
      },
      summaryPreference: body.summaryPreference,
      scanPolicy: body.scanPolicy,
      idempotencyKey: `activate-source:${body.providerKey}:${body.targetKind}:${body.targetValue}:${targetUserId}`,
      correlationId: `activate-source:${targetUserId}`,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a user subscription to a provider-specific source target.',
  })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:interests',
    workspaceRoleDescription:
      'Comma-separated workspace roles. User subscription creation allows owner, admin or member.',
  })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateUserSubscriptionRequestDto,
  ): Promise<CreateUserSubscriptionResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const targetUserId = resolveUserOwnedTarget(body.userId, authorization);

    const result = await this.createUserSubscription.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      providerKey: body.providerKey,
      targetKind: body.targetKind,
      targetValue: body.targetValue,
      targetConfig: body.targetConfig,
      schedule: {
        recipientKey: body.schedule.recipientKey,
        channel: body.schedule.channel,
        intervalSeconds: body.schedule.intervalSeconds,
        includeNoSignal: body.schedule.includeNoSignal,
        nextRunAt: body.schedule.nextRunAt === undefined ? undefined : parseDate(body.schedule.nextRunAt, 'nextRunAt'),
      },
      summaryPreference: body.summaryPreference,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List source target subscriptions for one user.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:interests',
    workspaceRoleDescription:
      'Comma-separated workspace roles. User subscription reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'userId', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('userId') userId: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListUserSubscriptionsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeRead(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    );
    const targetUserId = resolveUserOwnedTarget(userId ?? '', authorization);

    const result = await this.listUserSubscriptions.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'User subscription list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Put(':subscriptionId/summary-preference')
  @ApiOperation({
    summary: 'Create or update the summary preference overlay for a user subscription.',
  })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription:
      'Comma-separated workspace roles. User summary preference writes allow owner, admin or member.',
  })
  async upsertSummaryPreference(
    @Param('subscriptionId') subscriptionId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: UpsertUserSummaryPreferenceRequestDto,
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
    const targetUserId = resolveUserOwnedTarget(body.userId, authorization);

    const result = await this.upsertUserSummaryPreference.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: targetUserId,
      subscriptionId,
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

  private async authorizeRead(
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
        requiredScope: 'read:interests',
        operation: 'user_subscriptions.read',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'user_subscriptions.read',
      roles: this.workspaceRoleHeaderParser.parse(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return undefined;
  }

  private async authorizeWrite(
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
        requiredScope: 'write:interests',
        operation: 'user_subscriptions.create',
      });
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'user_subscriptions.create',
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
): string => {
  if (authorization?.actorType !== 'user') {
    return requestedUserId;
  }

  if (requestedUserId.trim() !== authorization.userId) {
    throw new DomainError('authorization.denied', 'Bearer JWT user cannot access another user subscription preference');
  }

  return authorization.userId;
};

const parseDate = (value: string, fieldName: string): Date => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError('validation.failed', `${fieldName} must be a valid ISO date`);
  }

  return parsed;
};

const optionalRestField = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);
