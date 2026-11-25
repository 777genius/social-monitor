import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_scan_policy_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/set_scan_policy_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/scan_policy.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_id.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_scan_policies_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_scan_policy_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/scan_policy_store.dart';
import 'package:social_monitor_sources/src/presentation/view_models/scan_policy_form_draft.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('loads policy, applies preset and saves backend-valid values', () async {
    final store = _store();

    await store.loadFor(const SourceBindingId('binding-reddit'));
    expect(store.policyState, isA<ReadyViewState<ScanPolicy>>());

    store.applyPreset(ScanPolicyPreset.fifteenMinutes);
    await store.save();

    final saved = store.saveState as ReadyViewState<ScanPolicy>;
    expect(saved.value.intervalSeconds, 900);
    expect(saved.value.freshnessSeconds, 900);
    expect(saved.value.retryBudget, 3);
  });

  test('blocks invalid freshness before calling API', () async {
    final store = _store();

    await store.loadFor(const SourceBindingId('binding-reddit'));
    store.updateIntervalSeconds('3600');
    store.updateFreshnessSeconds('60');
    await store.save();

    final failure = store.saveState as FailureViewState<ScanPolicy>;
    expect(failure.failure.code, 'scan_policy.freshness_less_than_interval');
  });
}

ScanPolicyStore _store() {
  final catalog = GeneratedScanPolicyCatalog(
    apiClient: InMemoryScanPoliciesApiClient(items: [scanPolicyApiDto()]),
  );
  return ScanPolicyStore(
    loadScanPolicy: LoadScanPolicyUseCase(catalog),
    setScanPolicy: SetScanPolicyUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}
