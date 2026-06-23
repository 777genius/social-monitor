import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import type { ScanStatusFailureClass, ScanStatusUserState } from './scan-status-view';

export const scanJobStatusValues = ['requested', 'enqueued', 'succeeded', 'failed'] as const satisfies readonly ScanJobStatus[];

const scanAttemptStatusValues = ['running', 'succeeded', 'failed'] as const satisfies readonly ScanExecutionAttemptStatus[];
const scanStatusUserStateValues = [
  'scan_pending',
  'scan_in_progress',
  'content_current',
  'scan_degraded',
] as const satisfies readonly ScanStatusUserState[];
const scanStatusFailureClassValues = [
  'provider_unavailable',
  'provider_rate_limited',
  'worker_conflict',
  'system_failure',
] as const satisfies readonly ScanStatusFailureClass[];

export class ScanExecutionAttemptResponseDto {
  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty({ enum: scanAttemptStatusValues })
  declare readonly status: ScanExecutionAttemptStatus;

  @ApiProperty({ format: 'date-time' })
  declare readonly startedAt: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly finishedAt?: string;

  @ApiProperty()
  declare readonly fetched: number;

  @ApiProperty()
  declare readonly inserted: number;

  @ApiProperty()
  declare readonly skippedDuplicates: number;

  @ApiProperty()
  declare readonly projected: number;

  @ApiPropertyOptional()
  declare readonly failureReason?: string;
}

export class ScanStatusResponseDto {
  @ApiProperty()
  declare readonly scanJobId: string;

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly scanPolicyId: string;

  @ApiProperty({ enum: scanJobStatusValues })
  declare readonly status: ScanJobStatus;

  @ApiProperty({ enum: scanStatusUserStateValues })
  declare readonly userState: ScanStatusUserState;

  @ApiPropertyOptional({ enum: scanStatusFailureClassValues })
  declare readonly failureClass?: ScanStatusFailureClass;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly requestedAt: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly enqueuedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly completedAt?: string;

  @ApiPropertyOptional()
  declare readonly failureReason?: string;

  @ApiPropertyOptional({ type: () => ScanExecutionAttemptResponseDto })
  declare readonly latestAttempt?: ScanExecutionAttemptResponseDto;
}
