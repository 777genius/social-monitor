import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { summaryFeedbackCategories } from "../../domain";

const summaryFeedbackTriageOwners = [
  "product-owner",
  "source-owner",
  "summary-owner",
  "support-owner",
] as const;

export class RecordSummaryFeedbackRequestDto {
  @ApiProperty({ enum: summaryFeedbackCategories })
  @IsIn(summaryFeedbackCategories)
  declare readonly category: (typeof summaryFeedbackCategories)[number];

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

export class SummaryFeedbackEvidenceDto {
  @ApiProperty()
  declare readonly summaryId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiPropertyOptional()
  declare readonly citationId?: string;

  @ApiPropertyOptional()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  declare readonly sourceItemId?: string;

  @ApiPropertyOptional()
  declare readonly providerKey?: string;
}

export class SummaryFeedbackResponseDto {
  @ApiProperty()
  declare readonly feedbackId: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty()
  declare readonly summaryId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly submittedBy: string;

  @ApiProperty({ minimum: 1, maximum: 5 })
  declare readonly rating: number;

  @ApiProperty({ enum: summaryFeedbackCategories })
  declare readonly category: string;

  @ApiPropertyOptional()
  declare readonly comment?: string;

  @ApiProperty({ type: () => SummaryFeedbackEvidenceDto })
  declare readonly evidence: SummaryFeedbackEvidenceDto;

  @ApiProperty({ enum: summaryFeedbackTriageOwners })
  declare readonly triageOwner: string;

  @ApiProperty()
  declare readonly eligibleForEvalFixture: boolean;

  @ApiProperty({ format: "date-time" })
  declare readonly createdAt: string;
}

export class RecordSummaryFeedbackResponseDto {
  @ApiProperty()
  declare readonly feedbackId: string;

  @ApiProperty()
  declare readonly created: boolean;

  @ApiProperty({ enum: summaryFeedbackCategories })
  declare readonly category: string;

  @ApiProperty({ enum: summaryFeedbackTriageOwners })
  declare readonly triageOwner: string;

  @ApiProperty({ type: () => SummaryFeedbackEvidenceDto })
  declare readonly evidence: SummaryFeedbackEvidenceDto;

  @ApiProperty()
  declare readonly eligibleForEvalFixture: boolean;

  @ApiProperty({ format: "date-time" })
  declare readonly createdAt: string;
}

export class ListSummaryFeedbackResponseDto {
  @ApiProperty({ type: () => [SummaryFeedbackResponseDto] })
  declare readonly items: readonly SummaryFeedbackResponseDto[];

  @ApiPropertyOptional()
  declare readonly nextCursor?: string;
}
