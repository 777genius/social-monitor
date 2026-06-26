import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import type {
  GetSourceBindingHealthResult,
  SourceBindingHealthAttemptView,
  SourceBindingHealthFreshnessView,
  SourceBindingHealthPolicyView,
  SourceBindingHealthRecentWindowView,
  SourceBindingHealthSchedulerDecision,
  SourceBindingHealthSchedulerDecisionView,
  SourceBindingHealthScanView,
  SourceBindingHealthState,
  SourceBindingProviderHealthState,
} from '../../features/get-source-binding-health/get-source-binding-health.result';
import type { ScanStatusFailureClass, ScanStatusUserState } from '../../features/shared/scan-status-view';
import type { ScanJobStatus } from '../../domain';
import type { ScanExecutionAttemptStatus } from '../../ports';
import { SourceBindingResponseDto } from './list-source-bindings.dto';
import { ScanPolicyCadenceResponseDto } from './scan-policy-cadence.dto';

export const sourceBindingHealthStateValues = [
  'paused',
  'not_configured',
  'scheduled',
  'scanning',
  'healthy',
  'stale',
  'degraded',
] as const satisfies readonly SourceBindingHealthState[];

const scanJobStatusValues = ['requested', 'enqueued', 'succeeded', 'failed'] as const satisfies readonly ScanJobStatus[];
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
const sourceBindingProviderHealthStateValues = [
  'unknown',
  'operational',
  'degraded',
  'down',
] as const satisfies readonly SourceBindingProviderHealthState[];
const sourceBindingHealthSchedulerDecisionValues = [
  'ready',
  'paused',
  'not_configured',
  'active_scan',
  'fresh_success',
  'rate_limit_backoff',
  'provider_failure_backoff',
  'scheduled_later',
] as const satisfies readonly SourceBindingHealthSchedulerDecision[];

export class SourceBindingHealthAttemptResponseDto implements SourceBindingHealthAttemptView {
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

export class SourceBindingHealthScanResponseDto implements SourceBindingHealthScanView {
  @ApiProperty()
  declare readonly scanJobId: string;

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

  @ApiPropertyOptional({ type: () => SourceBindingHealthAttemptResponseDto })
  declare readonly latestAttempt?: SourceBindingHealthAttemptResponseDto;
}

export class SourceBindingHealthFreshnessResponseDto implements SourceBindingHealthFreshnessView {
  @ApiProperty()
  declare readonly isFresh: boolean;

  @ApiPropertyOptional()
  declare readonly ageSeconds?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly freshnessDeadlineAt?: string;

  @ApiPropertyOptional()
  declare readonly staleBySeconds?: number;
}

export class SourceBindingHealthRecentWindowResponseDto implements SourceBindingHealthRecentWindowView {
  @ApiProperty({ enum: sourceBindingProviderHealthStateValues })
  declare readonly providerHealthState: SourceBindingProviderHealthState;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowStartedAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly windowEndedAt: string;

  @ApiProperty()
  declare readonly totalScans: number;

  @ApiProperty()
  declare readonly succeededScans: number;

  @ApiProperty()
  declare readonly failedScans: number;

  @ApiProperty()
  declare readonly activeScans: number;

  @ApiProperty()
  declare readonly rateLimitedScans: number;

  @ApiProperty()
  declare readonly providerUnavailableScans: number;

  @ApiProperty()
  declare readonly consecutiveFailures: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastSucceededAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly lastFailedAt?: string;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class SourceBindingHealthPolicyResponseDto implements SourceBindingHealthPolicyView {
  @ApiProperty()
  declare readonly id: string;

  @ApiProperty()
  declare readonly tenantId: SourceBindingHealthPolicyView['tenantId'];

  @ApiProperty()
  declare readonly workspaceId: SourceBindingHealthPolicyView['workspaceId'];

  @ApiProperty()
  declare readonly sourceBindingId: string;

  @ApiProperty()
  declare readonly intervalSeconds: number;

  @ApiProperty()
  declare readonly freshnessSeconds: number;

  @ApiProperty()
  declare readonly retryBudget: number;

  @ApiProperty({ format: 'date-time' })
  declare readonly nextRunAt: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly createdAt: string;

  @ApiPropertyOptional({ type: () => ScanPolicyCadenceResponseDto })
  declare readonly cadence?: ScanPolicyCadenceResponseDto;

  @ApiProperty()
  declare readonly isDue: boolean;
}

export class SourceBindingHealthSchedulerDecisionResponseDto implements SourceBindingHealthSchedulerDecisionView {
  @ApiProperty()
  declare readonly canScanNow: boolean;

  @ApiProperty({ enum: sourceBindingHealthSchedulerDecisionValues })
  declare readonly decision: SourceBindingHealthSchedulerDecision;

  @ApiProperty()
  declare readonly reason: string;

  @ApiProperty()
  declare readonly minimumIntervalSeconds: number;

  @ApiPropertyOptional()
  declare readonly configuredIntervalSeconds?: number;

  @ApiPropertyOptional()
  declare readonly effectiveIntervalSeconds?: number;

  @ApiPropertyOptional()
  declare readonly freshnessSeconds?: number;

  @ApiPropertyOptional()
  declare readonly providerMinimumIntervalEnforced?: boolean;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly nextEligibleAt?: string;

  @ApiPropertyOptional()
  declare readonly waitSeconds?: number;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly rateLimitBackoffUntil?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  declare readonly providerFailureBackoffUntil?: string;

  @ApiProperty({ type: String, isArray: true })
  declare readonly signals: readonly string[];
}

export class SourceBindingHealthResponseDto implements GetSourceBindingHealthResult {
  @ApiProperty({ type: () => SourceBindingResponseDto })
  declare readonly sourceBinding: SourceBindingResponseDto;

  @ApiProperty({ enum: sourceBindingHealthStateValues })
  declare readonly healthState: SourceBindingHealthState;

  @ApiProperty()
  declare readonly operatorAction: string;

  @ApiProperty({ format: 'date-time' })
  declare readonly evaluatedAt: string;

  @ApiProperty({ type: () => SourceBindingHealthSchedulerDecisionResponseDto })
  declare readonly schedulerDecision: SourceBindingHealthSchedulerDecisionResponseDto;

  @ApiPropertyOptional({ type: () => SourceBindingHealthPolicyResponseDto })
  declare readonly scanPolicy?: SourceBindingHealthPolicyResponseDto;

  @ApiPropertyOptional({ type: () => SourceBindingHealthScanResponseDto })
  declare readonly latestScan?: SourceBindingHealthScanResponseDto;

  @ApiPropertyOptional({ type: () => SourceBindingHealthFreshnessResponseDto })
  declare readonly freshness?: SourceBindingHealthFreshnessResponseDto;

  @ApiPropertyOptional({ type: () => SourceBindingHealthRecentWindowResponseDto })
  declare readonly recentWindow?: SourceBindingHealthRecentWindowResponseDto;
}
