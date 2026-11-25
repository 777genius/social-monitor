import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/mappers/scan_policy_mapper.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('maps scan policy dto to typed domain policy', () {
    const mapper = ScanPolicyMapper();

    final policy = mapper.toDomain(
      scanPolicyApiDto(
        intervalSeconds: 900,
        freshnessSeconds: 1800,
        retryBudget: 5,
      ),
    );

    expect(policy.id.value, 'scan-policy-reddit');
    expect(policy.sourceBindingId.value, 'binding-reddit');
    expect(policy.intervalSeconds, 900);
    expect(policy.freshnessSeconds, 1800);
    expect(policy.retryBudget, 5);
  });
}
