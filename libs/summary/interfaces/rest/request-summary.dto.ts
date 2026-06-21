import { IsOptional, IsString, MinLength } from 'class-validator';

import type { SummaryJobStatus } from '../../domain';

export class RequestSummaryRequestDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  userId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  subscriptionId?: string;
}

export type RequestSummaryResponseDto = {
  readonly summaryJobId: string;
  readonly status: SummaryJobStatus;
  readonly created: boolean;
};
