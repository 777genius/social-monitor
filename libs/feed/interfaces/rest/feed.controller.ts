import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

import { GetFeedItemUseCase } from '../../features/get-feed-item/get-feed-item.use-case';
import { ListFeedItemsUseCase } from '../../features/list-feed-items/list-feed-items.use-case';
import type { GetFeedItemResponseDto, ListFeedItemsResponseDto } from './list-feed-items.dto';

@ApiTags('feed')
@Controller('feed/items')
export class FeedController {
  constructor(
    private readonly listFeedItems: ListFeedItemsUseCase,
    private readonly getFeedItem: GetFeedItemUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tenant/workspace feed items with cursor pagination.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('q') searchQuery: string | undefined,
  ): Promise<ListFeedItemsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.authorizeFeedRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader);
    const result = await this.listFeedItems.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: parseLimit(limitQuery),
      cursor,
      searchQuery: normalizeSearchQuery(searchQuery),
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
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Feed reads allow owner, admin, member or viewer.',
  })
  async get(
    @Param('feedItemId') feedItemId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
  ): Promise<GetFeedItemResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    this.authorizeFeedRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader);
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

  private authorizeFeedRead(tenantId: TenantId, workspaceId: WorkspaceId, workspaceRoleHeader: string | undefined): void {
    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'feed.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}

const parseLimit = (value: string | undefined): number => {
  if (value === undefined) {
    return 20;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) ? parsed : Number.NaN;
};

const normalizeSearchQuery = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};
