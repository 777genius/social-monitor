import { Body, Controller, Delete, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { DomainError, requireTenantScope, type TenantId, type WorkspaceId } from '@social-monitor/shared-kernel';
import { CheckPublicApiRateLimitUseCase } from '@social-monitor/usage/features/check-public-api-rate-limit/check-public-api-rate-limit.use-case';
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
    private readonly verifyApiKey: VerifyApiKeyUseCase,
    private readonly checkPublicApiRateLimit: CheckPublicApiRateLimitUseCase,
    private readonly recordPublicApiAuditEvent: RecordPublicApiAuditEventUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an outbound webhook endpoint and return its signing secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateWebhookEndpointRequestDto,
  ): Promise<CreateWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);

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
  @ApiHeader({ name: 'authorization', required: true })
  async list(
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Query('limit') limitQuery: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ): Promise<ListWebhookEndpointsResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);
    const result = await this.listWebhookEndpoints.execute({
      tenantId: tenant,
      workspaceId: workspace,
      limit: limitQuery === undefined ? 50 : Number(limitQuery),
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
  @ApiHeader({ name: 'authorization', required: true })
  async get(
    @Param('webhookEndpointId') webhookEndpointId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<GetWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);
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
  @ApiHeader({ name: 'authorization', required: true })
  async disable(
    @Param('webhookEndpointId') webhookEndpointId: string,
    @Headers('x-tenant-id') tenantHeader: string | undefined,
    @Headers('x-workspace-id') workspaceHeader: string | undefined,
    @Headers('authorization') authorizationHeader: string | undefined,
  ): Promise<DisableWebhookEndpointResponseDto> {
    const { tenantId: tenant, workspaceId: workspace } = requireTenantScope({
      tenantIdHeader: tenantHeader,
      workspaceIdHeader: workspaceHeader,
    });
    const authorization = await this.authorizeWebhookEndpointManagement(authorizationHeader, tenant, workspace);
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

  private async authorizeWebhookEndpointManagement(
    authorizationHeader: string | undefined,
    tenant: TenantId,
    workspace: WorkspaceId,
  ): Promise<{ readonly apiKeyId: string }> {
    const verifiedApiKey = await this.verifyApiKey.execute({
      secret: parseBearerSecret(authorizationHeader),
      requiredScope: 'write:webhook_endpoints',
    });

    if (!verifiedApiKey.ok) {
      throw verifiedApiKey.error;
    }

    if (verifiedApiKey.value.apiKey.tenantId !== tenant || verifiedApiKey.value.apiKey.workspaceId !== workspace) {
      throw new DomainError('authorization.denied', 'API key tenant or workspace does not match request scope');
    }

    const rateLimit = await this.checkPublicApiRateLimit.execute({
      subjectKey: `api-key:${verifiedApiKey.value.apiKey.id}`,
      operation: 'webhook_endpoints.manage',
      limit: publicApiRateLimitPerMinute(),
      windowSeconds: 60,
    });

    if (!rateLimit.ok) {
      throw rateLimit.error;
    }

    return {
      apiKeyId: verifiedApiKey.value.apiKey.id,
    };
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

const parseBearerSecret = (authorizationHeader: string | undefined): string => {
  const [scheme, secret, extra] = authorizationHeader?.trim().split(/\s+/) ?? [];

  if (scheme?.toLowerCase() !== 'bearer' || secret === undefined || extra !== undefined) {
    throw new DomainError('authorization.denied', 'Bearer API key is required');
  }

  return secret;
};

const publicApiRateLimitPerMinute = (): number => {
  const configured = Number(process.env.PUBLIC_API_RATE_LIMIT_PER_MINUTE);

  if (Number.isInteger(configured) && configured > 0) {
    return configured;
  }

  return 60;
};
