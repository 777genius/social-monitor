import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

export class SetScanPolicyRequestDto {
  @ApiProperty({ minimum: 60 })
  @IsInt()
  @Min(60)
  declare readonly intervalSeconds: number;

  @ApiProperty({ minimum: 60 })
  @IsInt()
  @Min(60)
  declare readonly freshnessSeconds: number;

  @ApiProperty({ minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(10)
  declare readonly retryBudget: number;
}

export class SetScanPolicyResponseDto {
  @ApiProperty()
  declare readonly scanPolicyId: string;

  @ApiProperty()
  declare readonly created: boolean;

  @ApiProperty()
  declare readonly updated: boolean;
}
