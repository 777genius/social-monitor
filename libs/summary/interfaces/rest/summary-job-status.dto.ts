import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

const summaryJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
] as const;

export class SummaryJobTimelineEventDto {
  @ApiProperty({ enum: summaryJobStatuses })
  declare readonly status: (typeof summaryJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly occurredAt: string;

  @ApiProperty()
  declare readonly message: string;
}

export class SummaryJobStatusResponseDto {
  @ApiProperty()
  declare readonly summaryJobId: string;

  @ApiProperty()
  declare readonly interestId: string;

  @ApiProperty({ enum: summaryJobStatuses })
  declare readonly status: (typeof summaryJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly requestedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly startedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly completedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly failedAt?: string;

  @ApiPropertyOptional()
  declare readonly summaryId?: string;

  @ApiPropertyOptional()
  declare readonly failureReason?: string;

  @ApiProperty({ type: () => [SummaryJobTimelineEventDto] })
  declare readonly timeline: readonly SummaryJobTimelineEventDto[];
}
