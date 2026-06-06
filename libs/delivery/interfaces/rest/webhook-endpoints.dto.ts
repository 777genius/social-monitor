import { ArrayMinSize, IsArray, IsString, IsUrl, MinLength } from 'class-validator';

import type { CreateWebhookEndpointResult } from '../../features/create-webhook-endpoint/create-webhook-endpoint.result';
import type { GetWebhookEndpointResult } from '../../features/get-webhook-endpoint/get-webhook-endpoint.result';

export class CreateWebhookEndpointRequestDto {
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  url!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MinLength(3, { each: true })
  eventTypes!: string[];
}

export type CreateWebhookEndpointResponseDto = CreateWebhookEndpointResult;
export type GetWebhookEndpointResponseDto = GetWebhookEndpointResult;
