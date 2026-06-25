import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, ValidateNested } from "class-validator";

import { BriefingScopeDto } from "./briefing.dto";

export class RequestBriefingRequestDto {
  @ApiProperty({ type: () => BriefingScopeDto })
  @ValidateNested()
  @Type(() => BriefingScopeDto)
  declare readonly scope: BriefingScopeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  declare readonly subscriptionId?: string;
}

export class RequestBriefingResponseDto {
  @ApiProperty()
  declare readonly briefingJobId: string;

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
