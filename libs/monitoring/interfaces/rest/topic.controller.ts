import { Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope } from '@social-monitor/shared-kernel';

import { CreateTopicUseCase } from '../../features/create-topic/create-topic.use-case';
import { ListTopicsUseCase } from '../../features/list-topics/list-topics.use-case';
import { CreateTopicRequestDto, type CreateTopicResponseDto } from './create-topic.dto';
import type { ListTopicsResponseDto } from './list-topics.dto';

@ApiTags('topics')
@Controller('topics')
export class TopicController {
  constructor(
    private readonly createTopic: CreateTopicUseCase,
    private readonly listTopics: ListTopicsUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a topic inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'x-workspace-role', required: true, description: 'Comma-separated workspace roles. Topic creation requires owner or admin.' })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: CreateTopicRequestDto,
  ): Promise<CreateTopicResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'topics.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    return this.createTopic
      .execute({
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        name: body.name,
        query: body.query,
        idempotencyKey,
        correlationId: requestId ?? crypto.randomUUID(),
      })
      .then((result) => {
        if (!result.ok) {
          throw result.error;
        }

        return result.value;
      });
  }

  @Get()
  @ApiOperation({ summary: 'List topics inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Topic reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListTopicsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      action: 'topics.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }

    const result = await this.listTopics.execute({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      limit: limitQuery === undefined ? 50 : Number(limitQuery),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}
