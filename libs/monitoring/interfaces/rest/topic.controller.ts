import { Body, Controller, Get, Headers, Inject, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiKeyRequestAuthorizer,
  hasBearerAuthorizationHeader,
} from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { ApiKeyOrWorkspaceRoleAuth } from '@social-monitor/identity/interfaces/rest/api-key-openapi.decorators';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  parseWorkspaceRolesHeader,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';

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
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a topic inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'write:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Topic creation requires owner or admin.',
  })
  @ApiHeader({ name: 'idempotency-key', required: true })
  create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers('x-request-id') requestId: string | undefined,
    @Body() body: CreateTopicRequestDto,
  ): Promise<CreateTopicResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });

    return this.authorizeTopicWrite(
      scope.tenantId,
      scope.workspaceId,
      workspaceRoleHeader,
      authorizationHeader,
    ).then(() => this.createTopic
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
      }));
  }

  @Get()
  @ApiOperation({ summary: 'List topics inside the current tenant/workspace.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiKeyOrWorkspaceRoleAuth({
    apiKeyScope: 'read:topics',
    workspaceRoleDescription: 'Comma-separated workspace roles. Topic reads allow owner, admin, member or viewer.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListTopicsResponseDto> {
    const scope = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    await this.authorizeTopicRead(scope.tenantId, scope.workspaceId, workspaceRoleHeader, authorizationHeader);

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

  private async authorizeTopicRead(
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
        requiredScope: 'read:topics',
        operation: 'topics.read',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'topics.read',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async authorizeTopicWrite(
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
        requiredScope: 'write:topics',
        operation: 'topics.create',
      });
      return;
    }

    const authorization = this.workspaceAuthorization.authorize({
      tenantId,
      workspaceId,
      action: 'topics.create',
      roles: parseWorkspaceRolesHeader(workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }
}
