import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/generated_interest_coverage_plans_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedInterestCoveragePlansApiClient.fromRuntime(
        runtime: Object(),
      ),
      throwsArgumentError,
    );
  });
}
