import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/generated_scan_runs_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedScanRunsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });
}
