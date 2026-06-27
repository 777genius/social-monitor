import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator";

import { ReaderSummaryScopeDto } from "./reader-summary.dto";

export class RequestReaderSummaryRequestDto {
  @ApiProperty({ type: () => ReaderSummaryScopeDto })
  @ValidateNested()
  @Type(() => ReaderSummaryScopeDto)
  declare readonly scope: ReaderSummaryScopeDto;

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

  @ApiProperty({
    enum: ["requested", "running", "completed", "no_signal", "failed"],
  })
  declare readonly status:
    | "requested"
    | "running"
    | "completed"
    | "no_signal"
    | "failed";

  @ApiProperty()
  declare readonly created: boolean;
}
