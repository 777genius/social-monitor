import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsString, IsUrl, MinLength } from 'class-validator';

import type { CreateWebhookEndpointResult } from '../../features/create-webhook-endpoint/create-webhook-endpoint.result';
import type { DisableWebhookEndpointResult } from '../../features/disable-webhook-endpoint/disable-webhook-endpoint.result';
import type { GetWebhookEndpointResult } from '../../features/get-webhook-endpoint/get-webhook-endpoint.result';
import type { ListWebhookEndpointsResult } from '../../features/list-webhook-endpoints/list-webhook-endpoints.result';

export class CreateWebhookEndpointRequestDto {
  @ApiProperty({ format: 'uri' })
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;

  @ApiProperty({ type: [String], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  eventTypes!: string[];
}

export type CreateWebhookEndpointResponseDto = CreateWebhookEndpointResult;
export type DisableWebhookEndpointResponseDto = DisableWebhookEndpointResult;
export type GetWebhookEndpointResponseDto = GetWebhookEndpointResult;
export type ListWebhookEndpointsResponseDto = ListWebhookEndpointsResult;
