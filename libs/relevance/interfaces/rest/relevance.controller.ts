import { Body, Controller, Get, Headers, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { BuildPersonalizedDigestUseCase } from '../../features/build-personalized-digest/build-personalized-digest.use-case';
import { RankFeedItemsUseCase } from '../../features/rank-feed-items/rank-feed-items.use-case';
import { RecordRelevanceFeedbackUseCase } from '../../features/record-relevance-feedback/record-relevance-feedback.use-case';
import { UpsertUserRelevanceProfileUseCase } from '../../features/upsert-user-relevance-profile/upsert-user-relevance-profile.use-case';
import {
  BuildPersonalizedDigestResponseDto,
  RankFeedItemsResponseDto,
  RecordRelevanceFeedbackRequestDto,
  RecordRelevanceFeedbackResponseDto,
  UpsertUserRelevanceProfileRequestDto,
  UpsertUserRelevanceProfileResponseDto,
} from './relevance.dto';

@ApiTags('relevance')
@Controller('relevance/users/:userId')
export class RelevanceController {
  constructor(
    private readonly upsertUserRelevanceProfile: UpsertUserRelevanceProfileUseCase,
    private readonly rankFeedItems: RankFeedItemsUseCase,
    private readonly buildPersonalizedDigest: BuildPersonalizedDigestUseCase,
    private readonly recordRelevanceFeedback: RecordRelevanceFeedbackUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Put('profile')
  @ApiOperation({ summary: 'Create or update personalized relevance weights for one user.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Relevance profile writes allow owner, admin or member.',
  })
  @ApiOkResponse({ type: UpsertUserRelevanceProfileResponseDto })
  async upsertProfile(
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: UpsertUserRelevanceProfileRequestDto,
  ): Promise<UpsertUserRelevanceProfileResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.upsertUserRelevanceProfile.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId,
      topicWeights: body.topicWeights,
      sourceWeights: body.sourceWeights,
      keywordWeights: body.keywordWeights,
      mutedKeywords: body.mutedKeywords,
      blockedProviderKeys: body.blockedProviderKeys,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get('digest')
  @ApiOperation({ summary: 'Build a personalized digest candidate set for one user and time window.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Personalized digest reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'topicIds', required: true, type: String })
  @ApiQuery({ name: 'windowStartedAt', required: true, type: String })
  @ApiQuery({ name: 'windowEndedAt', required: true, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: BuildPersonalizedDigestResponseDto })
  async digest(
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('topicIds') topicIdsQuery: string | undefined,
    @Query('windowStartedAt') windowStartedAtQuery: string | undefined,
    @Query('windowEndedAt') windowEndedAtQuery: string | undefined,
    @Query('limit') limitQuery: string | undefined,
  ): Promise<BuildPersonalizedDigestResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.buildPersonalizedDigest.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId,
      topicIds: parseTopicIds(topicIdsQuery),
      windowStartedAt: parseRequiredDate(windowStartedAtQuery, 'windowStartedAt'),
      windowEndedAt: parseRequiredDate(windowEndedAtQuery, 'windowEndedAt'),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 10,
        invalidMessage: 'Personalized digest limit must be between 1 and 100',
      }),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get('feed')
  @ApiOperation({ summary: 'Rank feed items for one user with dedupe, clustering and source safety metadata.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Personalized feed reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'topicId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'observedAfter', required: false, type: String })
  @ApiOkResponse({ type: RankFeedItemsResponseDto })
  async feed(
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('topicId') topicId: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('observedAfter') observedAfterQuery: string | undefined,
  ): Promise<RankFeedItemsResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.rankFeedItems.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId,
      topicId: normalizeOptional(topicId),
      observedAfter: parseOptionalDate(observedAfterQuery, 'observedAfter'),
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: 'Relevance feed limit must be between 1 and 100',
      }),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Post('feedback')
  @ApiOperation({ summary: 'Record relevance feedback and update the user learning profile.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:summaries',
    workspaceRoleDescription: 'Comma-separated workspace roles. Relevance feedback writes allow owner, admin or member.',
  })
  @ApiCreatedResponse({ type: RecordRelevanceFeedbackResponseDto })
  async feedback(
    @Param('userId') userId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: RecordRelevanceFeedbackRequestDto,
  ): Promise<RecordRelevanceFeedbackResponseDto> {
    const scope = requireTenantScope({ tenantIdHeader: tenantHeader, workspaceIdHeader: workspaceHeader });
    await this.authorizeWrite(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.recordRelevanceFeedback.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId,
      idempotencyKey: body.idempotencyKey,
      action: body.action,
      rating: body.rating,
      target: {
        feedItemId: body.feedItemId,
        topicId: body.topicId,
        providerKey: body.providerKey,
        title: body.title,
        bodyPreview: body.bodyPreview,
        canonicalUrl: body.canonicalUrl,
        feedbackReason: body.reason,
      },
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
  ): Promise<void> {
    if (hasBearerAuthorizationHeader(authorizationHeader)) {
      await this.apiKeyRequestAuthorizer.authorize({
        authorizationHeader,
        tenantId,
        workspaceId,
        requiredScope: 'read:feed',
        operation: 'feed.read',
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

  private async authorizeWrite(
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
        operation: 'user_summary_preferences.set',
      });
      return;
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
  }
}

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const parseOptionalDate = (value: string | undefined, label: string): Date | undefined => {
  const normalized = normalizeOptional(value);

  if (normalized === undefined) {
    return undefined;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new DomainError('validation.failed', `${label} must be a valid ISO date`);
  }

  return date;
};

const parseRequiredDate = (value: string | undefined, label: string): Date => {
  const date = parseOptionalDate(value, label);

  if (date === undefined) {
    throw new DomainError('validation.failed', `${label} is required`);
  }

  return date;
};

const parseTopicIds = (value: string | undefined): readonly string[] =>
  (value ?? '')
    .split(',')
    .map((topicId) => topicId.trim())
    .filter((topicId) => topicId.length > 0);
