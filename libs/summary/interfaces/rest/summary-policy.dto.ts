import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import type { GetSummaryPolicyResult } from '../../features/get-summary-policy/get-summary-policy.result';
import type { UpsertSummaryPolicyResult } from '../../features/upsert-summary-policy/upsert-summary-policy.result';

export class UpsertSummaryPolicyRequestDto {
  @ApiProperty({ enum: ['auto', 'en', 'ru'] })
  @IsIn(['auto', 'en', 'ru'])
  language!: 'auto' | 'en' | 'ru';

  @ApiProperty({ enum: ['executive_brief', 'bullet_digest', 'risk_brief'] })
  @IsIn(['executive_brief', 'bullet_digest', 'risk_brief'])
  format!: 'executive_brief' | 'bullet_digest' | 'risk_brief';

  @ApiProperty({ enum: ['neutral', 'concise', 'analytical'] })
  @IsIn(['neutral', 'concise', 'analytical'])
  tone!: 'neutral' | 'concise' | 'analytical';

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  maxKeyPoints!: number;

  @ApiProperty()
  @IsBoolean()
  includeRisks!: boolean;

  @ApiProperty()
  @IsBoolean()
  includeSourceHighlights!: boolean;

  @ApiPropertyOptional({ maxLength: 1200 })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  customInstructions?: string;
}

export type GetSummaryPolicyResponseDto = GetSummaryPolicyResult;

export type UpsertSummaryPolicyResponseDto = UpsertSummaryPolicyResult;
