import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/generated_source_bindings_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedSourceBindingsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });
}
