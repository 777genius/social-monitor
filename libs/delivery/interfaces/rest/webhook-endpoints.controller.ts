import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

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
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create an outbound webhook endpoint and return its signing secret once.' })
  @ApiHeader({ name: 'x-tenant-id', required: true })
  @ApiHeader({ name: 'x-workspace-id', required: true })
  async create(
    @Headers('x-tenant-id') tenantHeader: string,
    @Headers('x-workspace-id') workspaceHeader: string,
    @Body() body: CreateWebhookEndpointRequestDto,
  ): Promise<CreateWebhookEndpointResponseDto> {
    const result = await this.createWebhookEndpoint.execute({
      tenantId: tenantId(tenantHeader),
      workspaceId: workspaceId(workspaceHeader),
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
