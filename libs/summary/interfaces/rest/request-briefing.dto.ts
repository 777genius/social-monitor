import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

import { BriefingScopeDto } from "./briefing.dto";

export class RequestBriefingRequestDto {
  @ApiProperty({ type: () => BriefingScopeDto })
  declare readonly scope: BriefingScopeDto;

  @ApiPropertyOptional()
  declare readonly userId?: string;

  @ApiPropertyOptional()
  declare readonly subscriptionId?: string;
}

export class RequestBriefingResponseDto {
  @ApiProperty()
  declare readonly briefingJobId: string;

  @ApiProperty({ enum: ["requested", "running", "completed", "no_signal", "failed"] })
  declare readonly status: "requested" | "running" | "completed" | "no_signal" | "failed";

  @ApiProperty()
  declare readonly created: boolean;
}
