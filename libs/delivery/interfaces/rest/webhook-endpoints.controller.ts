import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VerifyApiKeyUseCase } from '@social-monitor/identity/features/verify-api-key/verify-api-key.use-case';
import { DomainError, tenantId, workspaceId } from '@social-monitor/shared-kernel';

import { CreateWebhookEndpointUseCase } from '../../features/create-webhook-endpoint/create-webhook-endpoint.use-case';
import { GetWebhookEndpointUseCase } from '../../features/get-webhook-endpoint/get-webhook-endpoint.use-case';
import {
  CreateWebhookEndpointRequestDto,
  type CreateWebhookEndpointResponseDto,
  type GetWebhookEndpointResponseDto,
} from './webhook-endpoints.dto';

@ApiTags('webhook-endpoints')
@Controller('delivery/webhook-endpoints')
export class WebhookEndpointsController {
  constructor(
    private readonly createWebhookEndpoint: CreateWebhookEndpointUseCase,
    private readonly getWebhookEndpoint: GetWebhookEndpointUseCase,
    private readonly verifyApiKey: VerifyApiKeyUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an outbound webhook endpoint and return its signing secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  @ApiHeader({ name: 'authorization', required: true })
  async create(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Headers('authorization') authorizationHeader: string | undefined,
    @Body() body: CreateWebhookEndpointRequestDto,
  ): Promise<CreateWebhookEndpointResponseDto> {
    const tenant = tenantId(tenantHeader);
    const workspace = workspaceId(workspaceHeader);
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

    const result = await this.createWebhookEndpoint.execute({
      tenantId: tenant,
      workspaceId: workspace,
      url: body.url,
      eventTypes: body.eventTypes,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }

  @Get(':webhookEndpointId')
  @ApiOperation({ summary: 'Get an outbound webhook endpoint without exposing its signing secret.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async get(
    @Param('webhookEndpointId') webhookEndpointId: string,
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
  ): Promise<GetWebhookEndpointResponseDto> {
    const result = await this.getWebhookEndpoint.execute({
      tenantId: tenantId(tenantHeader),
      workspaceId: workspaceId(workspaceHeader),
      webhookEndpointId,
    });

    if (!result.ok) {
      throw result.error;
    }

    return result.value;
  }
}

const parseBearerSecret = (authorizationHeader: string | undefined): string => {
  const [scheme, secret, extra] = authorizationHeader?.trim().split(/\s+/) ?? [];

  if (scheme !== 'Bearer' || secret === undefined || extra !== undefined) {
    throw new DomainError('authorization.denied', 'Bearer API key is required');
  }

  return secret;
};
