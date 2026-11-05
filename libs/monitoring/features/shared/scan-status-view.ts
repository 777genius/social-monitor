import { classifyScanFailure, type ScanFailureClass } from '../../domain/policies/scan-failure-classification';
import type { JsonObject } from '@social-monitor/shared-kernel';

import type { ScanJobStatus } from '../../domain';

export type ScanStatusUserState =
  | 'scan_pending'
  | 'scan_in_progress'
  | 'content_current'
  | 'scan_degraded';

export type ScanStatusFailureClass = ScanFailureClass;

export type ScanStatusView = {
  readonly userState: ScanStatusUserState;
  readonly failureClass?: ScanStatusFailureClass;
  readonly operatorAction: string;
};

export const buildScanStatusView = (params: {
  readonly status: ScanJobStatus;
  readonly failureReason?: string;
  readonly failureMetadata?: JsonObject;
  readonly executionMetadata?: JsonObject;
}): ScanStatusView => {
  if (params.status === 'requested') {
    return {
      userState: 'scan_pending',
      operatorAction: 'wait_for_queue_enqueue_or_check_scheduler_lag',
    };
  }

  if (params.status === 'enqueued') {
    return {
      userState: 'scan_in_progress',
      operatorAction: 'check_worker_lag_if_status_exceeds_freshness_slo',
    };
  }

  if (params.status === 'succeeded') {
    if (params.executionMetadata?.collectionComplete === false) {
      return {
        userState: 'scan_degraded',
        operatorAction: params.executionMetadata.backfillPending === true
          ? 'wait_for_collection_backfill'
          : 'inspect_incomplete_source_content',
      };
    }
    return {
      userState: 'content_current',
      operatorAction: 'no_action_required',
    };
  }

  const failureClass = classifyScanFailure(
    params.failureReason,
    params.failureMetadata,
  );

  return {
    userState: 'scan_degraded',
    failureClass,
    operatorAction: operatorActionFor(failureClass),
  };
};

const operatorActionFor = (failureClass: ScanStatusFailureClass): string => {
  switch (failureClass) {
    case 'provider_rate_limited':
      return 'reduce_scan_frequency_or_pause_affected_source';
    case 'provider_auth_failed':
      return 'refresh_or_reconnect_source_credentials';
    case 'provider_unavailable':
      return 'check_provider_health_and_retry_budget';
    case 'worker_conflict':
      return 'inspect_scan_lease_and_worker_lag';
    case 'system_failure':
      return 'inspect_scan_attempt_logs_and_dlq';
  }
};
