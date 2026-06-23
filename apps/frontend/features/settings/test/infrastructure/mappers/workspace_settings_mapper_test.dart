import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_settings/src/infrastructure/mappers/workspace_settings_mapper.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  test('redacts support diagnostics before copy text is exposed', () {
    const mapper = WorkspaceSettingsMapper();

    final settings = mapper.toDomain(
      workspaceSettingsApiDto(
        diagnostics: diagnosticSnapshotApiDto(
          traceId: 'trace Bearer demo',
          featureSnapshot: 'features sk-demo',
        ),
      ),
    );

    expect(settings.diagnostics.safeCopyText, contains('[redacted]'));
    expect(settings.diagnostics.safeCopyText, isNot(contains('Bearer demo')));
    expect(settings.diagnostics.safeCopyText, isNot(contains('sk-demo')));
  });
}
