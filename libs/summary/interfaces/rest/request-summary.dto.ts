import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

const summaryJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
] as const;

export class RequestSummaryRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  subscriptionId?: string;
}

export class RequestSummaryResponseDto {
  @ApiProperty()
  declare readonly summaryJobId: string;

  @ApiProperty({ enum: summaryJobStatuses })
  declare readonly status: (typeof summaryJobStatuses)[number];

  @ApiProperty()
  declare readonly created: boolean;
}
