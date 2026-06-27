import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsDefined,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { GetDeliveryAttemptResult } from '../../features/get-delivery-attempt/get-delivery-attempt.result';
import type { ListDeliveryAttemptsResult } from '../../features/list-delivery-attempts/list-delivery-attempts.result';
import type { QueueDeliveryAttemptResult } from '../../features/queue-delivery-attempt/queue-delivery-attempt.result';
import type { RetryDeliveryAttemptResult } from '../../features/retry-delivery-attempt/retry-delivery-attempt.result';

class RetryDeliveryContentDto {
  @ApiPropertyOptional({ minLength: 1 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  subject?: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  body!: string;
}

export class RetryDeliveryAttemptRequestDto {
  @ApiProperty({ type: () => RetryDeliveryContentDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RetryDeliveryContentDto)
  content!: RetryDeliveryContentDto;
}

export type GetDeliveryAttemptResponseDto = GetDeliveryAttemptResult;
export type ListDeliveryAttemptsResponseDto = ListDeliveryAttemptsResult;
export type QueueDeliveryAttemptResponseDto = QueueDeliveryAttemptResult;
export type RetryDeliveryAttemptResponseDto = RetryDeliveryAttemptResult;
