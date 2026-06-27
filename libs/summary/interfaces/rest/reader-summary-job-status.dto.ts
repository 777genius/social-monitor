import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { ReaderSummaryScopeDto } from "./reader-summary.dto";

const readerSummaryJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
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

  @ApiProperty({ type: () => [ReaderSummaryJobTimelineEventDto] })
  declare readonly timeline: readonly ReaderSummaryJobTimelineEventDto[];
}
