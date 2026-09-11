import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class ReaderSummaryHeadlineReferenceDto {
  @ApiProperty({ enum: ["title", "bodyPreview"] })
  declare readonly field: "title" | "bodyPreview";

  @ApiProperty({ minimum: 0 })
  declare readonly start: number;

  @ApiProperty({ minimum: 1 })
  declare readonly end: number;

  @ApiProperty()
  declare readonly quote: string;

}

export class ReaderSummaryHeadlineQualificationDto {
  @ApiProperty()
  declare readonly phrase: string;

  @ApiProperty({ type: () => [ReaderSummaryHeadlineReferenceDto] })
  declare readonly evidence: readonly ReaderSummaryHeadlineReferenceDto[];

}

export class ReaderSummaryHeadlineBindingDto {
  @ApiProperty()
  declare readonly candidateId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiProperty()
  declare readonly tenantId: string;

  @ApiProperty()
  declare readonly workspaceId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly trustedIntent: string;

  @ApiProperty({ enum: ["title_only", "body_present"] })
  declare readonly availability: "title_only" | "body_present";

  @ApiProperty({ pattern: "^[0-9a-f]{64}$" })
  declare readonly reviewedInputDigest: string;

}

export class ReaderSummaryHeadlineWholeInputDto {
  @ApiProperty({ minimum: 0 })
  declare readonly titleLength: number;

  @ApiProperty({ minimum: 0 })
  declare readonly bodyLength: number;

  @ApiProperty({ enum: ["none", "preserved", "subject_only"] })
  declare readonly qualificationJudgment: "none" | "preserved" | "subject_only";

}

export class ReaderSummaryDisplayHeadlineDto {
  @ApiProperty({ enum: ["accepted", "unavailable"] })
  declare readonly status: "accepted" | "unavailable";

  @ApiPropertyOptional()
  declare readonly reasonCode?: string;

  @ApiPropertyOptional({ enum: ["claim", "subject_label"] })
  declare readonly kind?: "claim" | "subject_label";

  @ApiPropertyOptional({ minLength: 1, maxLength: 119 })
  declare readonly text?: string;

  @ApiPropertyOptional({ type: () => ReaderSummaryHeadlineBindingDto })
  declare readonly binding?: ReaderSummaryHeadlineBindingDto;

  @ApiPropertyOptional({ type: () => [ReaderSummaryHeadlineReferenceDto] })
  declare readonly support?: readonly ReaderSummaryHeadlineReferenceDto[];

  @ApiPropertyOptional({ type: () => [ReaderSummaryHeadlineQualificationDto] })
  declare readonly qualifications?: readonly ReaderSummaryHeadlineQualificationDto[];

  @ApiPropertyOptional({ minimum: 0.8, maximum: 1 })
  declare readonly confidence?: number;

  @ApiPropertyOptional({ type: () => ReaderSummaryHeadlineWholeInputDto })
  declare readonly wholeInput?: ReaderSummaryHeadlineWholeInputDto;

}

export class ReaderSummaryCapturedSourceDto {
  @ApiProperty()
  declare readonly title: string;

  @ApiPropertyOptional()
  declare readonly body?: string;

  @ApiProperty({ enum: ["available", "unavailable"] })
  declare readonly captureAvailability: "available" | "unavailable";

  @ApiProperty({ enum: ["body_present", "title_only", "unavailable"] })
  declare readonly reviewAvailability: "body_present" | "title_only" | "unavailable";

}

export class ReaderSummaryDisplayHeadlineSealDto {
  @ApiProperty({ type: () => ReaderSummaryDisplayHeadlineDto })
  declare readonly headline: ReaderSummaryDisplayHeadlineDto;

  @ApiPropertyOptional({ pattern: "^[0-9a-f]{64}$" })
  declare readonly capturedSourceDigest?: string;

}
