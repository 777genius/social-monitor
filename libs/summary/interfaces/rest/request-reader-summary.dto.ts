import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";

import { ReaderSummaryPeriodDto, ReaderSummaryScopeDto } from "./reader-summary.dto";

export class RequestReaderSummaryPeriodDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  declare readonly startedAt: string;

  @ApiProperty({ format: "date-time" })
  @IsDateString()
  declare readonly endedAt: string;

  @ApiProperty()
  @IsString()
  declare readonly timezone: string;
}

export class RequestReaderSummaryRequestDto {
  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  @ValidateNested()
  @Type(() => ReaderSummaryScopeDto)
  declare readonly scope: ReaderSummaryScopeDto;

  @ApiPropertyOptional({ enum: ["daily", "weekly", "monthly", "custom"] })
  @IsOptional()
  @IsIn(["daily", "weekly", "monthly", "custom"])
  declare readonly cadence?: "daily" | "weekly" | "monthly" | "custom";

  @ApiPropertyOptional({ type: () => RequestReaderSummaryPeriodDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RequestReaderSummaryPeriodDto)
  declare readonly period?: RequestReaderSummaryPeriodDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly subscriptionId?: string;
}

export class RequestReaderSummaryResponseDto {
  @ApiProperty()
  declare readonly readerSummaryJobId: string;

  @ApiProperty({ type: () => ReaderSummaryPeriodDto })
  declare readonly period: ReaderSummaryPeriodDto;

  @ApiProperty({
    enum: [
      "requested",
      "running",
      "completed",
      "no_signal",
      "failed",
      "quality_rejected",
    ],
  })
  declare readonly status:
    | "requested"
    | "running"
    | "completed"
    | "no_signal"
    | "failed"
    | "quality_rejected";

  @ApiProperty()
  declare readonly created: boolean;
}
