import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/generated_workspace_settings_api_client.dart';

void main() {
  test('rejects non generated api runtime objects', () {
    expect(
      () => GeneratedWorkspaceSettingsApiClient.fromRuntime(runtime: Object()),
      throwsArgumentError,
    );
  });
}
