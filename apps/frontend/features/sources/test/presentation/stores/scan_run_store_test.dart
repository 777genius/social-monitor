import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_scan_status_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/request_scan_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/scan_request.dart';
import 'package:social_monitor_sources/src/domain/entities/scan_status_snapshot.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_id.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_scan_runs_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_scan_run_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/scan_run_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test(
    'requests scan and loads status without auto polling in tests',
    () async {
      final store = _store();
      store.bindTo(const SourceBindingId('binding-reddit'));

      await store.requestScan();

      expect(store.requestState, isA<ReadyViewState<ScanRequest>>());
      final status = store.statusState as ReadyViewState<ScanStatusSnapshot>;
      expect(status.value.scanJobId.value, 'scan-job-1');
      expect(status.value.operatorAction, 'Scan queued for collection worker');
    },
  );

  test('clears stale scan state when binding changes', () async {
    final store = _store();
    store.bindTo(const SourceBindingId('binding-reddit'));
    await store.requestScan();

    store.bindTo(const SourceBindingId('binding-rss'));

    expect(store.requestState, isA<InitialViewState<ScanRequest>>());
    expect(store.statusState, isA<InitialViewState<ScanStatusSnapshot>>());
  });
}

ScanRunStore _store() {
  final catalog = GeneratedScanRunCatalog(
    apiClient: InMemoryScanRunsApiClient(statuses: [scanStatusApiDto()]),
  );
  return ScanRunStore(
    requestScan: RequestScanUseCase(catalog),
    loadScanStatus: LoadScanStatusUseCase(catalog),
    scope: sourceWorkspaceScope,
    autoPolling: false,
  );
}
