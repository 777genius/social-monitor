import { Type } from 'class-transformer';
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
import type { ListUserSubscriptionsResult } from '../../features/list-user-subscriptions/list-user-subscriptions.result';
import type { UpsertUserSummaryPreferenceResult } from '../../features/upsert-user-summary-preference/upsert-user-summary-preference.result';

export class UserSubscriptionScheduleRequestDto {
  @IsString()
  @MinLength(1)
  recipientKey!: string;

  @IsString()
  @IsIn(['in_app', 'email', 'webhook'])
  channel!: 'in_app' | 'email' | 'webhook';

  @IsInt()
  @Min(60)
  intervalSeconds!: number;

  @IsBoolean()
  includeNoSignal!: boolean;

  @IsOptional()
  @IsString()
  @IsISO8601()
  nextRunAt?: string;
}

export class UserSummaryPreferenceRequestDto {
  @IsOptional()
  @IsIn(['auto', 'en', 'ru'])
  language?: 'auto' | 'en' | 'ru';

  @IsOptional()
  @IsIn(['executive_brief', 'bullet_digest', 'risk_brief'])
  format?: 'executive_brief' | 'bullet_digest' | 'risk_brief';

  @IsOptional()
  @IsIn(['neutral', 'concise', 'analytical'])
  tone?: 'neutral' | 'concise' | 'analytical';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxKeyPoints?: number;

  @IsOptional()
  @IsBoolean()
  includeRisks?: boolean;

  @IsOptional()
  @IsBoolean()
  includeSourceHighlights?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  customInstructions?: string;
}

export class CreateUserSubscriptionRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(2)
  providerKey!: string;

  @IsString()
  @MinLength(2)
  targetKind!: string;

  @IsString()
  @MinLength(1)
  targetValue!: string;

  @IsOptional()
  @IsObject()
  targetConfig: Readonly<Record<string, unknown>> = {};

  @IsDefined()
  @ValidateNested()
  @Type(() => UserSubscriptionScheduleRequestDto)
  schedule!: UserSubscriptionScheduleRequestDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UserSummaryPreferenceRequestDto)
  summaryPreference?: UserSummaryPreferenceRequestDto;
}

export class UpsertUserSummaryPreferenceRequestDto extends UserSummaryPreferenceRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

export class UpsertTopicUserSummaryPreferenceRequestDto extends UserSummaryPreferenceRequestDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}

export type CreateUserSubscriptionResponseDto = CreateUserSubscriptionResult;
export type ListUserSubscriptionsResponseDto = ListUserSubscriptionsResult;
export type UpsertUserSummaryPreferenceResponseDto = UpsertUserSummaryPreferenceResult;
