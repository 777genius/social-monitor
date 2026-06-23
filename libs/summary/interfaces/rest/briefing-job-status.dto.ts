import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { BriefingScopeDto } from "./briefing.dto";

const briefingJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
] as const;

export class BriefingJobTimelineEventDto {
  @ApiProperty({ enum: briefingJobStatuses })
  declare readonly status: (typeof briefingJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly occurredAt: string;

  @ApiProperty()
  declare readonly message: string;
}

export class BriefingJobStatusResponseDto {
  @ApiProperty()
  declare readonly briefingJobId: string;

  @ApiProperty({ type: () => BriefingScopeDto })
  declare readonly scope: BriefingScopeDto;

  @ApiProperty({ enum: briefingJobStatuses })
  declare readonly status: (typeof briefingJobStatuses)[number];

  @ApiProperty({ format: "date-time" })
  declare readonly requestedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly startedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly completedAt?: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly failedAt?: string;

  @ApiPropertyOptional()
  declare readonly briefingId?: string;

  @ApiPropertyOptional()
  declare readonly failureReason?: string;

  @ApiProperty({ type: () => [BriefingJobTimelineEventDto] })
  declare readonly timeline: readonly BriefingJobTimelineEventDto[];
}
