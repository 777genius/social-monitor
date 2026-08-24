import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

export class ReaderSummaryScopeDto {
  @ApiProperty({ enum: ["workspace", "interest"] })
  @IsIn(["workspace", "interest"])
  declare readonly type: "workspace" | "interest";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly interestId?: string;
}

export class ReaderSummarySourceWindowDto {
  @ApiProperty()
  declare readonly windowId: string;

  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  declare readonly ingestionCutoff?: string;

  @ApiProperty({ type: [String] })
  declare readonly selectedFeedItemIds: readonly string[];

  @ApiProperty({ type: [String] })
  declare readonly storyClusterIds: readonly string[];
}

export class ReaderSummaryPeriodDto {
  @ApiProperty({ enum: ["daily", "weekly", "monthly", "custom"] })
  declare readonly cadence: "daily" | "weekly" | "monthly" | "custom";

  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;

  @ApiProperty()
  declare readonly timezone: string;

  @ApiProperty()
  declare readonly periodKey: string;
}

export class ReaderSummaryObservedAtRangeDto {
  @ApiProperty({ format: "date-time" })
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  declare readonly endedAt: string;
}
