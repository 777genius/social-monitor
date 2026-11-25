import { ApiProperty } from "@nestjs/swagger";

const summaryJobStatuses = [
  "requested",
  "running",
  "completed",
  "no_signal",
  "failed",
] as const;

export class RegenerateSummaryResponseDto {
  @ApiProperty()
  declare readonly summaryJobId: string;

  @ApiProperty({ enum: summaryJobStatuses })
  declare readonly status: (typeof summaryJobStatuses)[number];

  @ApiProperty()
  declare readonly created: boolean;
}
