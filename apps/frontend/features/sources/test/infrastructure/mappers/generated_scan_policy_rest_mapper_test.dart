import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_sources/src/infrastructure/api/scan_policy_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/generated_scan_policy_rest_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps generated scan policy response to feature dto', () {
    const mapper = GeneratedScanPolicyRestMapper();

    final dto = mapper.policy(
      generated.GetScanPolicyResponseDto(
        id: 'policy-1',
        tenantId: 'tenant-demo',
        workspaceId: 'workspace-demo',
        sourceBindingId: 'binding-reddit',
        intervalSeconds: 900,
        freshnessSeconds: 1800,
        retryBudget: 4,
        nextRunAt: DateTime.utc(2026, 6, 23, 13),
        createdAt: DateTime.utc(2026, 6, 23, 12),
      ),
    );

    expect(dto.id, 'policy-1');
    expect(dto.intervalSeconds, 900);
    expect(dto.freshnessSeconds, 1800);
    expect(dto.retryBudget, 4);
  });

  test('maps set policy request without leaking generated dto upstream', () {
    const mapper = GeneratedScanPolicyRestMapper();

    final dto = mapper.setPolicy(
      SetScanPolicyApiRequestDto(
        scope: sourceWorkspaceScope,
        sourceBindingId: 'binding-reddit',
        intervalSeconds: 3600,
        freshnessSeconds: 3600,
        retryBudget: 3,
        idempotencyKey: 'policy-key',
      ),
    );

    expect(dto.intervalSeconds, 3600);
    expect(dto.freshnessSeconds, 3600);
    expect(dto.retryBudget, 3);
  });
}
