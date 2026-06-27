import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_sources/src/infrastructure/mappers/generated_scan_run_rest_mapper.dart';

void main() {
  test('maps generated scan request response to feature dto', () {
    const mapper = GeneratedScanRunRestMapper();

    final dto = mapper.request(
      const generated.RequestScanResponseDto(
        scanJobId: 'scan-job-1',
        status: generated.RequestScanResponseDtoStatusStatus.enqueued,
        created: true,
        requestDecision: generated.RequestScanDecisionResponseDto(
          createdNewScan: true,
          decision:
              generated.RequestScanDecisionResponseDtoDecisionDecision.created,
          reason: 'Scan requested.',
          signals: ['manual_request'],
        ),
      ),
    );

    expect(dto.scanJobId, 'scan-job-1');
    expect(dto.status, 'enqueued');
    expect(dto.created, isTrue);
  });

  test('maps generated scan status response and latest attempt', () {
    const mapper = GeneratedScanRunRestMapper();

    final dto = mapper.status(
      generated.ScanStatusResponseDto(
        scanJobId: 'scan-job-1',
        sourceBindingId: 'binding-reddit',
        scanPolicyId: 'scan-policy-1',
        status: generated.ScanStatusResponseDtoStatusStatus.succeeded,
        userState:
            generated.ScanStatusResponseDtoUserStateUserState.contentCurrent,
        operatorAction: 'Content is current',
        requestedAt: DateTime.utc(2026, 6, 23, 12),
        latestAttempt: generated.ScanExecutionAttemptResponseDto(
          sourceBindingId: 'binding-reddit',
          status:
              generated.ScanExecutionAttemptResponseDtoStatusStatus.succeeded,
          startedAt: DateTime.utc(2026, 6, 23, 12),
          fetched: 42,
          inserted: 31,
          skippedDuplicates: 8,
          projected: 31,
        ),
      ),
    );

    expect(dto.status, 'succeeded');
    expect(dto.userState, 'content_current');
    expect(dto.latestAttempt?.inserted, 31);
  });
}
