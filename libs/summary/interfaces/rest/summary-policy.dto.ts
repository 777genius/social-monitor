import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import type { GetSummaryPolicyResult } from '../../features/get-summary-policy/get-summary-policy.result';
import type { UpsertSummaryPolicyResult } from '../../features/upsert-summary-policy/upsert-summary-policy.result';

export class UpsertSummaryPolicyRequestDto {
  @IsIn(['auto', 'en', 'ru'])
  language!: 'auto' | 'en' | 'ru';

  @IsIn(['executive_brief', 'bullet_digest', 'risk_brief'])
  format!: 'executive_brief' | 'bullet_digest' | 'risk_brief';

  @IsIn(['neutral', 'concise', 'analytical'])
  tone!: 'neutral' | 'concise' | 'analytical';

  @IsInt()
  @Min(1)
  @Max(10)
  maxKeyPoints!: number;

  @IsBoolean()
  includeRisks!: boolean;

  @IsBoolean()
  includeSourceHighlights!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1200)
  customInstructions?: string;
}

export type GetSummaryPolicyResponseDto = GetSummaryPolicyResult;

export type UpsertSummaryPolicyResponseDto = UpsertSummaryPolicyResult;
