import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/generated_source_profiles_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedSourceProfilesApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });
}
