import { IsInt, Max, Min } from 'class-validator';

export class SetScanPolicyRequestDto {
  @IsInt()
  @Min(60)
  intervalSeconds!: number;

  @IsInt()
  @Min(60)
  freshnessSeconds!: number;

  @IsInt()
  @Min(0)
  @Max(10)
  retryBudget!: number;
}

export type SetScanPolicyResponseDto = {
  readonly scanPolicyId: string;
  readonly created: boolean;
};
