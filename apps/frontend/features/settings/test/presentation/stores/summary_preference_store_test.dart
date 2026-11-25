import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_settings/src/application/use_cases/load_summary_preference_use_case.dart';
import 'package:social_monitor_settings/src/application/use_cases/save_summary_preference_use_case.dart';
import 'package:social_monitor_settings/src/domain/entities/summary_preference.dart';
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_format.dart';
import 'package:social_monitor_settings/src/domain/value_objects/summary_preference_tone.dart';
import 'package:social_monitor_settings/src/infrastructure/api_clients/in_memory_summary_preference_api_client.dart';
import 'package:social_monitor_settings/src/infrastructure/repositories/generated_summary_preference_catalog.dart';
import 'package:social_monitor_settings/src/presentation/stores/summary_preference_store.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../support/settings_test_fixtures.dart';

void main() {
  test(
    'loads default summary preference when no saved overlay exists',
    () async {
      final store = _store(source: 'none');

      await store.load();

      final state = store.state as ReadyViewState<SummaryPreference>;
      expect(state.value.source, SummaryPreferenceSource.none);
      expect(store.format, SummaryPreferenceFormat.executiveBrief);
      expect(store.tone, SummaryPreferenceTone.analytical);
    },
  );

  test('validates custom prompt length before save', () async {
    final store = _store();

    store.updateCustomInstructions(
      'x' * (SummaryPreference.maxCustomInstructionsLength + 1),
    );
    await store.save();

    final state = store.saveState as FailureViewState<SummaryPreference>;
    expect(state.failure, isA<ValidationFailure>());
    expect(state.failure.code, 'settings.summary_preference_prompt_too_long');
  });

  test('saves format tone and multiline custom prompt', () async {
    final store = _store();

    store.updateFormat(SummaryPreferenceFormat.bulletDigest);
    store.updateTone(SummaryPreferenceTone.concise);
    store.updateIncludeRisks(false);
    store.updateCustomInstructions('Focus MCP.\nAvoid launch noise.');
    await store.save();

    final state = store.state as ReadyViewState<SummaryPreference>;
    expect(state.value.format, SummaryPreferenceFormat.bulletDigest);
    expect(state.value.tone, SummaryPreferenceTone.concise);
    expect(state.value.includeRisks, isFalse);
    expect(state.value.customInstructions, contains('\n'));
    expect(state.value.source, SummaryPreferenceSource.saved);
  });
}

SummaryPreferenceStore _store({String source = 'interest'}) {
  final catalog = GeneratedSummaryPreferenceCatalog(
    apiClient: InMemorySummaryPreferenceApiClient(
      preference: summaryPreferenceApiDto(source: source),
    ),
  );
  return SummaryPreferenceStore(
    loadSummaryPreference: LoadSummaryPreferenceUseCase(catalog),
    saveSummaryPreference: SaveSummaryPreferenceUseCase(catalog),
    scope: settingsWorkspaceScope,
    userId: 'user-demo',
  );
}
