import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyRequestAuthorizer } from '@social-monitor/identity/interfaces/rest/api-key-request-authorizer';
import { WorkspaceRoleHeaderParser } from '@social-monitor/identity/interfaces/authorization/workspace-role-header.parser';
import {
  WORKSPACE_AUTHORIZATION_POLICY,
  type WorkspaceAction,
  type WorkspaceAuthorizationPolicyPort,
} from '@social-monitor/identity/ports';
import { parsePaginationLimit } from '@social-monitor/platform-request-context';
import { requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { RecordPublicApiAuditEventUseCase } from '@social-monitor/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case';

import { CreateWebhookEndpointUseCase } from '../../features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { DisableWebhookEndpointUseCase } from '../../features/disable-webhook-endpoint/disable-webhook-endpoint.use-case';
import { GetWebhookEndpointUseCase } from '../../features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import { ListWebhookEndpointsUseCase } from '../../features/list-webhook-endpoints/list-webhook-endpoints.use-case';
import {
  CreateWebhookEndpointRequestDto,
  type CreateWebhookEndpointResponseDto,
  type DisableWebhookEndpointResponseDto,
  type GetWebhookEndpointResponseDto,
  type ListWebhookEndpointsResponseDto,
} from './webhook-endpoints.dto';

@ApiTags('webhook-endpoints')
@Controller('delivery/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(
    private readonly createWebhookEndpoint: CreateWebhookEndpointUseCase,
    private readonly getWebhookEndpoint: GetWebhookEndpointUseCase,
    private readonly listWebhookEndpoints: ListWebhookEndpointsUseCase,
    private readonly disableWebhookEndpoint: DisableWebhookEndpointUseCase,
    private readonly apiKeyRequestAuthorizer: ApiKeyRequestAuthorizer,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
    @Inject(WORKSPACE_AUTHORIZATION_POLICY)
    private readonly workspaceAuthorization: WorkspaceAuthorizationPolicyPort,
    private readonly workspaceRoleHeaderParser: WorkspaceRoleHeaderParser,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an outbound webhook endpoint and return its signing secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Webhook endpoint creation requires owner or admin.',
  })
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateWebhookEndpointRequestDto,
  ): Promise<CreateWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);
    this.authorizeWorkspaceRole({
      tenant,
      workspace,
      workspaceRoleHeader,
      action: 'webhook_endpoints.create',
    });

    const result = await this.createWebhookEndpoint.execute({
      tenantId: tenant,
      workspaceId: workspace,
      url: body.url,
      eventTypes: body.eventTypes,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordWebhookAuditEvent({
      tenant,
      workspace,
      actorId: authorization.apiKeyId,
      action: 'webhook_endpoint.created',
      outcome: 'succeeded',
      resourceId: result.value.endpoint.id,
      metadata: {
        eventTypes: result.value.endpoint.eventTypes,
        endpointStatus: result.value.endpoint.status,
      },
    });

    return result.value;
  }

  @Get()
  @ApiOperation({ summary: 'List outbound webhook endpoints without exposing signing secrets.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Webhook endpoint reads allow owner, admin, member or viewer.',
  })
  @ApiHeader({ name: 'authorization', required: true })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListWebhookEndpointsResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointRead(authorizationHeader, tenant, workspace);
    this.authorizeWorkspaceRole({
      tenant,
      workspace,
      workspaceRoleHeader,
      action: 'webhook_endpoints.read',
    });
    const result = await this.listWebhookEndpoints.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: parsePaginationLimit(limitQuery, {
        defaultLimit: 50,
        invalidMessage: 'Webhook endpoint list limit must be between 1 and 100',
      }),
      cursor,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordWebhookAuditEvent({
      tenant,
      workspace,
      actorId: authorization.apiKeyId,
      action: 'webhook_endpoint.listed',
      outcome: 'succeeded',
      metadata: {
        resultCount: result.value.endpoints.length,
        hasNextPage: result.value.nextCursor !== undefined,
      },
    });

    return result.value;
  }

  @Get(':webhookEndpointId')
  @ApiOperation({ summary: 'Get an outbound webhook endpoint without exposing its signing secret.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Webhook endpoint reads allow owner, admin, member or viewer.',
  })
  @ApiHeader({ name: 'authorization', required: true })
  async get(
    @Param('webhookEndpointId') webhookEndpointId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointRead(authorizationHeader, tenant, workspace);
    this.authorizeWorkspaceRole({
      tenant,
      workspace,
      workspaceRoleHeader,
      action: 'webhook_endpoints.read',
    });
    const result = await this.getWebhookEndpoint.execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordWebhookAuditEvent({
      tenant,
      workspace,
      actorId: authorization.apiKeyId,
      action: 'webhook_endpoint.read',
      outcome: 'succeeded',
      resourceId: result.value.id,
      metadata: {
        endpointStatus: result.value.status,
      },
    });

    return result.value;
  }

  @Delete(':webhookEndpointId')
  @ApiOperation({ summary: 'Disable an outbound webhook endpoint without deleting audit history or secrets.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({
    name: 'x-workspace-role',
    required: true,
    description: 'Comma-separated workspace roles. Webhook endpoint disable requires owner or admin.',
  })
  @ApiHeader({ name: 'authorization', required: true })
  async disable(
    @Param('webhookEndpointId') webhookEndpointId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('x-workspace-role') workspaceRoleHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<DisableWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);
    this.authorizeWorkspaceRole({
      tenant,
      workspace,
      workspaceRoleHeader,
      action: 'webhook_endpoints.disable',
    });
    const result = await this.disableWebhookEndpoint.execute({
      tenantId: tenant,
      workspaceId: workspace,
      webhookEndpointId,
    });

    if (!result.ok) {
      throw result.error;
    }

    await this.recordWebhookAuditEvent({
      tenant,
      workspace,
      actorId: authorization.apiKeyId,
      action: 'webhook_endpoint.disabled',
      outcome: 'succeeded',
      resourceId: result.value.id,
      metadata: {
        endpointStatus: result.value.status,
      },
    });

    return result.value;
  }

  private async authorizeWebhookEndpointRead(
    authorizationHeader: string | undefined,
    tenant: TenantId,
    workspace: WorkspaceId,
  ): Promise<{ readonly apiKeyId: string }> {
    return this.authorizeWebhookEndpointApiKey({
      authorizationHeader,
      tenant,
      workspace,
      requiredScope: 'read:webhook_endpoints',
      operation: 'webhook_endpoints.read',
    });
  }

  private async authorizeWebhookEndpointManagement(
    authorizationHeader: string | undefined,
    tenant: TenantId,
    workspace: WorkspaceId,
  ): Promise<{ readonly apiKeyId: string }> {
    return this.authorizeWebhookEndpointApiKey({
      authorizationHeader,
      tenant,
      workspace,
      requiredScope: 'write:webhook_endpoints',
      operation: 'webhook_endpoints.manage',
    });
  }

  private async authorizeWebhookEndpointApiKey(params: {
    readonly authorizationHeader: string | undefined;
    readonly tenant: TenantId;
    readonly workspace: WorkspaceId;
    readonly requiredScope: 'read:webhook_endpoints' | 'write:webhook_endpoints';
    readonly operation: 'webhook_endpoints.read' | 'webhook_endpoints.manage';
  }): Promise<{ readonly apiKeyId: string }> {
    const authorization = await this.apiKeyRequestAuthorizer.authorize({
      authorizationHeader: params.authorizationHeader,
      tenantId: params.tenant,
      workspaceId: params.workspace,
      requiredScope: params.requiredScope,
      operation: params.operation,
    });

    return {
      apiKeyId: authorization.apiKeyId,
    };
  }

  private authorizeWorkspaceRole(params: {
    readonly tenant: TenantId;
    readonly workspace: WorkspaceId;
    readonly workspaceRoleHeader: string | undefined;
    readonly action: WorkspaceAction;
  }): void {
    const authorization = this.workspaceAuthorization.authorize({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      action: params.action,
      roles: this.workspaceRoleHeaderParser.parse(params.workspaceRoleHeader),
    });

    if (!authorization.ok) {
      throw authorization.error;
    }
  }

  private async recordWebhookAuditEvent(params: {
    readonly tenant: TenantId;
    readonly workspace: WorkspaceId;
    readonly actorId: string;
    readonly action: string;
    readonly outcome: 'succeeded' | 'failed' | 'denied';
    readonly resourceId?: string;
    readonly metadata?: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  }): Promise<void> {
    const result = await this.recordPublicApiAuditEvent.execute({
      tenantId: params.tenant,
      workspaceId: params.workspace,
      actorType: 'api_key',
      actorId: params.actorId,
      action: params.action,
      outcome: params.outcome,
      resourceType: 'webhook_endpoint',
      resourceId: params.resourceId,
      metadata: params.metadata,
    });

    if (!result.ok) {
      throw result.error;
    }
  }
}
