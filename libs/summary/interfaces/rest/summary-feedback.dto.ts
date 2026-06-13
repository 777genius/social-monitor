import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { summaryFeedbackCategories, type SummaryFeedbackCategory } from '../../domain';
import type { RecordSummaryFeedbackResult } from '../../features/record-summary-feedback/record-summary-feedback.result';

export class RecordSummaryFeedbackRequestDto {
  @ApiProperty({ enum: summaryFeedbackCategories })
  declare readonly category: SummaryFeedbackCategory;

  @ApiProperty({ minimum: 1, maximum: 5 })
  declare readonly rating: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  declare readonly comment?: string;

  @ApiPropertyOptional()
  declare readonly citationId?: string;
}

export type RecordSummaryFeedbackResponseDto = RecordSummaryFeedbackResult;
