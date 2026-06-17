import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { summaryFeedbackCategories, type SummaryFeedbackCategory } from '../../domain';
import type { ListSummaryFeedbackResult } from '../../features/list-summary-feedback/list-summary-feedback.result';
import type { RecordSummaryFeedbackResult } from '../../features/record-summary-feedback/record-summary-feedback.result';

export class RecordSummaryFeedbackRequestDto {
  @ApiProperty({ enum: summaryFeedbackCategories })
  @IsIn(summaryFeedbackCategories)
  declare readonly category: SummaryFeedbackCategory;

  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  declare readonly rating: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  declare readonly comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly citationId?: string;
}

export type RecordSummaryFeedbackResponseDto = RecordSummaryFeedbackResult;

export type ListSummaryFeedbackResponseDto = ListSummaryFeedbackResult;
