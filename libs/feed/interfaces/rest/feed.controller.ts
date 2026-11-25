import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import { GetFeedItemResponseDto, ListFeedItemsResponseDto } from './list-feed-items.dto';

@ApiTags('feed')
@Controller('feed/items')
export class FeedController {
  constructor(
    private readonly listFeedItems: ListFeedItemsUseCase,
    private readonly getFeedItem: GetFeedItemUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace feed items with cursor pagination.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'interestId', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'providerKey', required: false, type: String })
  @ApiQuery({ name: 'repositoryTrendWindow', required: false, enum: ['24h', '48h', '7d', '30d', '90d'] })
  @ApiQuery({ name: 'repositoryLanguage', required: false, type: String })
  @ApiQuery({ name: 'repositoryTopic', required: false, type: String })
  @ApiOkResponse({ type: ListFeedItemsResponseDto })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('interestId') interestId: string | undefined,
    @Query('q') searchQuery: string | undefined,
    @Query('providerKey') providerKey: string | undefined,
    @Query('repositoryTrendWindow') repositoryTrendWindow: string | undefined,
    @Query('repositoryLanguage') repositoryLanguage: string | undefined,
    @Query('repositoryTopic') repositoryTopic: string | undefined,
  ): Promise<ListFeedItemsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeFeedRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.listFeedItems.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 20,
        invalidMessage: 'Feed page limit must be between 1 and 100',
      }),
      cursor,
      interestId: normalizeInterestId(interestId),
      searchQuery: normalizeSearchQuery(searchQuery),
      providerKey: normalizeKeyFilter(providerKey),
      repositoryTrendWindow: normalizeSearchQuery(repositoryTrendWindow),
      repositoryLanguage: normalizeSearchQuery(repositoryLanguage),
      repositoryTopic: normalizeSearchQuery(repositoryTopic),
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':feedItemId')
  @ApiOperation({ summary: 'Get one tenant/workspace feed item by id.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:feed',
    workspaceRoleDescription: 'Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer.',
  })
  @ApiOkResponse({ type: GetFeedItemResponseDto })
  async get(
    @Param('feedItemId') feedItemId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetFeedItemResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeFeedRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);
    const result = await this.getFeedItem.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      feedItemId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  private async authorizeFeedRead(
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
}

const normalizeSearchQuery = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizeInterestId = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const normalizeKeyFilter = (value: string | undefined): string | undefined => {
  const normalized = normalizeSearchQuery(value);

  return normalized?.toLocaleLowerCase('en-US');
};
