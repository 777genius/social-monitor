import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/connect_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_sources_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_source_health_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/pause_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/reconnect_source_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/resume_source_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/source_summary.dart';
import 'package:social_monitor_sources/src/domain/value_objects/credential_health.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_collection_status.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_summary_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_sources_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/sources_catalog_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('loads source catalog and exposes credential repair intent', () async {
    final store = _store([sourceSummaryApiDto()]);

    await store.load();

    final state = store.state as ReadyViewState<PageResult<SourceSummary>>;
    expect(state.value.items.single.credentialHealth, CredentialHealth.expired);
    expect(store.repairCandidate?.name, 'RSS feeds');
    expect(
      store.reconnectIntentFor(state.value.items.single).risk,
      UserActionRisk.credential,
    );
  });

  test(
    'reconnect repairs credential health and workspace switch clears state',
    () async {
      final store = _store([sourceSummaryApiDto()]);

      await store.load();
      await store.reconnect(store.repairCandidate!);

      final state = store.state as ReadyViewState<PageResult<SourceSummary>>;
      expect(
        state.value.items.single.credentialHealth,
        CredentialHealth.healthy,
      );

      store.updateScope(
        const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
      );
      expect(store.state, isA<InitialViewState<PageResult<SourceSummary>>>());
      expect(store.repairState, isA<InitialViewState<SourceSummary>>());
    },
  );

  test('connects pauses resumes and loads safe health summary', () async {
    final store = _store([sourceSummaryApiDto()]);

    await store.load();
    await store.connectDemoSource();
    await store.pause(store.selectedSource!);
    var state = store.state as ReadyViewState<PageResult<SourceSummary>>;
    expect(
      state.value.items.first.collectionStatus,
      SourceCollectionStatus.paused,
    );

    await store.resume(store.selectedSource!);
    state = store.state as ReadyViewState<PageResult<SourceSummary>>;
    expect(
      state.value.items.first.collectionStatus,
      SourceCollectionStatus.collecting,
    );

    await store.loadHealth(store.selectedSource!);
    expect(store.healthState, isA<ReadyViewState>());
  });
}

SourcesCatalogStore _store(List<SourceSummaryApiDto> items) {
  final catalog = GeneratedSourceCatalog(
    apiClient: InMemorySourcesApiClient(items: items),
  );
  return SourcesCatalogStore(
    listSources: ListSourcesUseCase(catalog),
    connectSource: ConnectSourceUseCase(catalog),
    reconnectSource: ReconnectSourceUseCase(catalog),
    pauseSource: PauseSourceUseCase(catalog),
    resumeSource: ResumeSourceUseCase(catalog),
    loadSourceHealth: LoadSourceHealthUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}
