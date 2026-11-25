import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { ReaderSummaryPeriodDto, ReaderSummaryScopeDto } from "./reader-summary.dto";

const readerSummaryJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
  "quality_rejected",
] as const;

const readerSummaryJobFailureClasses = [
  "quality_rejected",
  "system_failure",
] as const;

export class ReaderSummaryJobTimelineEventDto {
  @ApiProperty({ enum: readerSummaryJobStatuses })
  declare readonly status: (typeof readerSummaryJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly occurredAt: string;

  @ApiProperty()
  declare readonly message: string;
}

export class ReaderSummaryJobStatusResponseDto {
  @ApiProperty()
  declare readonly readerSummaryJobId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiProperty({ enum: readerSummaryJobStatuses })
  declare readonly status: (typeof readerSummaryJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly requestedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly startedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly completedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly failedAt?: string;

  @ApiPropertyOptional()
  declare readonly readerSummaryId?: string;

  @ApiPropertyOptional()
  declare readonly failureReason?: string;

  @ApiPropertyOptional({ enum: readerSummaryJobFailureClasses })
  declare readonly failureClass?: (typeof readerSummaryJobFailureClasses)[number];

  @ApiProperty({ type: () => [ReaderSummaryJobTimelineEventDto] })
  declare readonly timeline: readonly ReaderSummaryJobTimelineEventDto[];
}

export class ReaderSummaryQualityRejectionTopReadDto {
  @ApiProperty()
  declare readonly title: string;

  @ApiPropertyOptional()
  declare readonly providerKey?: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;

  @ApiProperty({ type: () => [String] })
  declare readonly citationIds: readonly string[];
}

export class ReaderSummaryQualityRejectionCitationDto {
  @ApiProperty()
  declare readonly citationId: string;

  @ApiProperty()
  declare readonly feedItemId: string;

  @ApiProperty()
  declare readonly sourceItemId: string;

  @ApiProperty()
  declare readonly providerKey: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class ReaderSummaryQualityRejectionViolationDto {
  @ApiProperty()
  declare readonly code: string;

  @ApiProperty()
  declare readonly reason: string;

  @ApiPropertyOptional()
  declare readonly topReadTitle?: string;

  @ApiPropertyOptional()
  declare readonly citationId?: string;

  @ApiPropertyOptional()
  declare readonly feedItemId?: string;

  @ApiPropertyOptional()
  declare readonly sourceItemId?: string;

  @ApiPropertyOptional()
  declare readonly providerKey?: string;

  @ApiPropertyOptional()
  declare readonly canonicalUrl?: string;
}

export class ReaderSummaryQualityRejectionShadowSignalDto {
  @ApiProperty()
  declare readonly code: string;

  @ApiProperty()
  declare readonly score: number;

  @ApiProperty()
  declare readonly reason: string;
}

export class ReaderSummaryQualityRejectionShadowDto {
  @ApiProperty({ enum: ["shadow"] })
  declare readonly mode: "shadow";

  @ApiProperty()
  declare readonly riskScore: number;

  @ApiProperty({ type: () => [ReaderSummaryQualityRejectionShadowSignalDto] })
  declare readonly signals: readonly ReaderSummaryQualityRejectionShadowSignalDto[];
}

export class ReaderSummaryQualityRejectionResponseDto {
  @ApiProperty()
  declare readonly readerSummaryJobId: string;

  @ApiProperty()
  declare readonly readerSummaryId: string;

  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiProperty()
  declare readonly headline: string;

  @ApiProperty({ enum: ["quality_rejected"] })
  declare readonly failureClass: "quality_rejected";

  @ApiProperty()
  declare readonly canonicalScore: number;

  @ApiProperty({ type: () => ReaderSummaryQualityRejectionShadowDto })
  declare readonly shadow: ReaderSummaryQualityRejectionShadowDto;

  @ApiProperty({ type: () => [String] })
  declare readonly reasonCodes: readonly string[];

  @ApiProperty({ type: () => [String] })
  declare readonly reasons: readonly string[];

  @ApiProperty({ type: () => [ReaderSummaryQualityRejectionViolationDto] })
  declare readonly violations: readonly ReaderSummaryQualityRejectionViolationDto[];

  @ApiProperty({ type: () => [ReaderSummaryQualityRejectionTopReadDto] })
  declare readonly topReads: readonly ReaderSummaryQualityRejectionTopReadDto[];

  @ApiProperty({ type: () => [ReaderSummaryQualityRejectionCitationDto] })
  declare readonly citations: readonly ReaderSummaryQualityRejectionCitationDto[];
}
