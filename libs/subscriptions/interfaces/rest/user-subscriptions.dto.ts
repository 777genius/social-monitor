import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsISO8601,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import type { CreateUserSubscriptionResult } from '../../features/create-user-subscription/create-user-subscription.result';
import type { ActivateTopicSourceResult } from '../../features/activate-topic-source/activate-topic-source.result';
import type { GetEffectiveUserSummaryPreferenceResult } from '../../features/get-effective-user-summary-preference/get-effective-user-summary-preference.result';
import type { ListUserSubscriptionsResult } from '../../features/list-user-subscriptions/list-user-subscriptions.result';
import type { UpsertUserSummaryPreferenceResult } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.result';

export class UserSubscriptionScheduleRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @ApiProperty({ enum: ['in_app', 'email', 'webhook'] })
  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @ApiProperty({ minimum: 60 })
  @IsInt()
  @Min(60)
  intervalSeconds!: number;

  @ApiProperty()
  @IsBoolean()
  includeNoSignal!: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsString()
  @IsISO8601()
  nextRunAt?: string;
}

export class UserSummaryPreferenceRequestDto {
  @ApiPropertyOptional({ enum: ['auto', 'en', 'ru'] })
  @IsOptional()
  @IsIn(['auto', 'en', 'ru'])
  language?: 'auto' | 'en' | 'ru';

  @ApiPropertyOptional({ enum: ['executive_brief', 'bullet_digest', 'risk_brief'] })
  @IsOptional()
  @IsIn(['executive_brief', 'bullet_digest', 'risk_brief'])
  format?: 'executive_brief' | 'bullet_digest' | 'risk_brief';

  @ApiPropertyOptional({ enum: ['neutral', 'concise', 'analytical'] })
  @IsOptional()
  @IsIn(['neutral', 'concise', 'analytical'])
  tone?: 'neutral' | 'concise' | 'analytical';

  @ApiPropertyOptional({ minimum: 1, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxKeyPoints?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeRisks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  includeSourceHighlights?: boolean;

  @ApiPropertyOptional({ maxLength: 1200 })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  customInstructions?: string;
}

export class CreateUserSubscriptionRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  userId!: string;

  @ApiProperty({
    description: 'Canonical provider key or supported legacy alias.',
    examples: ['reddit', 'github-issues', 'github-trending-page', 'x-twitter'],
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  providerKey!: string;

  @ApiProperty({
    description: 'Provider-specific target kind, for example subreddit, search_query, account or url.',
    minLength: 2,
  })
  @IsString()
  @MinLength(2)
  targetKind!: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  targetValue!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  targetConfig: Readonly<Record<string, unknown>> = {};

  @ApiProperty({ type: () => UserSubscriptionScheduleRequestDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => UserSubscriptionScheduleRequestDto)
  schedule!: UserSubscriptionScheduleRequestDto;

  @ApiPropertyOptional({ type: () => UserSummaryPreferenceRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UserSummaryPreferenceRequestDto)
  summaryPreference?: UserSummaryPreferenceRequestDto;
}

export class ActivateTopicSourceScanPolicyRequestDto {
  @ApiPropertyOptional({ minimum: 60 })
  @IsOptional()
  @IsInt()
  @Min(60)
  intervalSeconds?: number;

  @ApiPropertyOptional({ minimum: 60 })
  @IsOptional()
  @IsInt()
  @Min(60)
  freshnessSeconds?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  retryBudget?: number;
}

export class ActivateTopicSourceRequestDto extends CreateUserSubscriptionRequestDto {
  @ApiPropertyOptional({ type: () => ActivateTopicSourceScanPolicyRequestDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ActivateTopicSourceScanPolicyRequestDto)
  scanPolicy?: ActivateTopicSourceScanPolicyRequestDto;
}

export class UpsertUserSummaryPreferenceRequestDto extends UserSummaryPreferenceRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  userId!: string;
}

export class UpsertTopicUserSummaryPreferenceRequestDto extends UserSummaryPreferenceRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  userId!: string;
}

export type CreateUserSubscriptionResponseDto = CreateUserSubscriptionResult;
export type ActivateTopicSourceResponseDto = ActivateTopicSourceResult;
export type GetEffectiveUserSummaryPreferenceResponseDto = GetEffectiveUserSummaryPreferenceResult;
export type ListUserSubscriptionsResponseDto = ListUserSubscriptionsResult;
export type UpsertUserSummaryPreferenceResponseDto = UpsertUserSummaryPreferenceResult;
