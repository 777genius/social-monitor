import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/domain/value_objects/scan_attempt_status.dart';
import 'package:social_monitor_sources/src/domain/value_objects/scan_failure_class.dart';
import 'package:social_monitor_sources/src/domain/value_objects/scan_job_status.dart';
import 'package:social_monitor_sources/src/domain/value_objects/scan_user_state.dart';
import 'package:social_monitor_sources/src/infrastructure/api/scan_run_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/scan_run_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps scan request and status into typed domain state', () {
    const mapper = ScanRunMapper();

    final request = mapper.requestToDomain(
      const RequestScanApiResponseDto(
        scanJobId: 'scan-job-1',
        status: 'enqueued',
        created: true,
        requestDecision: ScanRequestDecisionApiDto(
          decision: 'provider_failure_backoff',
          reason: 'provider_failure_backoff_active',
          createdNewScan: false,
          providerHealthState: 'degraded',
          waitSeconds: 120,
          signals: ['provider_failure_backoff'],
        ),
      ),
    );
    final status = mapper.statusToDomain(
      scanStatusApiDto(
        status: 'failed',
        userState: 'scan_degraded',
        failureClass: 'provider_rate_limited',
        latestAttempt: scanAttemptApiDto(status: 'failed'),
      ),
    );

    expect(request.scanJobId.value, 'scan-job-1');
    expect(request.status, ScanJobStatus.enqueued);
    expect(request.decision.isBackoff, isTrue);
    expect(request.decision.providerHealthState, 'degraded');
    expect(request.decision.waitSeconds, 120);
    expect(status.status, ScanJobStatus.failed);
    expect(status.userState, ScanUserState.scanDegraded);
    expect(status.failureClass, ScanFailureClass.providerRateLimited);
    expect(status.latestAttempt?.status, ScanAttemptStatus.failed);
  });

  test('maps unknown scan status values as unknown', () {
    const mapper = ScanRunMapper();

    final status = mapper.statusToDomain(
      scanStatusApiDto(
        status: 'future_status',
        userState: 'future_state',
        failureClass: 'future_failure',
        latestAttempt: scanAttemptApiDto(status: 'future_attempt'),
      ),
    );

    expect(status.status, ScanJobStatus.unknown);
    expect(status.userState, ScanUserState.unknown);
    expect(status.failureClass, ScanFailureClass.unknown);
    expect(status.latestAttempt?.status, ScanAttemptStatus.unknown);
    expect(status.isTerminal, isFalse);
  });
}
