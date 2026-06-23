import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/bind_source_to_topic_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/change_source_binding_status_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_source_bindings_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_source_binding_health_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/source_binding.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_binding_status.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_topic_id.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_binding_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_source_bindings_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_binding_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/source_bindings_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('loads bindings, creates reddit listing and changes status', () async {
    final store = _store([sourceBindingApiDto()]);

    await store.load();
    var state =
        store.bindingsState as ReadyViewState<PageResult<SourceBinding>>;
    expect(state.value.items.single.providerKey.value, 'reddit');
    expect(store.healthState, isA<ReadyViewState>());

    store.openBindForm();
    store.updateMode('listing');
    store.updateSubreddit('flutterdev');
    store.updateListing('new');
    await store.bindSource();

    state = store.bindingsState as ReadyViewState<PageResult<SourceBinding>>;
    expect(state.value.items, hasLength(2));

    await store.pause(store.selectedBinding!);
    state = store.bindingsState as ReadyViewState<PageResult<SourceBinding>>;
    expect(store.selectedBinding?.status, SourceBindingStatus.paused);

    await store.resume(store.selectedBinding!);
    state = store.bindingsState as ReadyViewState<PageResult<SourceBinding>>;
    expect(store.selectedBinding?.status, SourceBindingStatus.enabled);
  });

  test('validates provider-specific bind form before calling API', () async {
    final store = _store([]);

    store.openBindForm();
    await store.bindSource();

    final failure = store.mutationState as FailureViewState<SourceBinding>;
    expect(failure.failure.code, 'source_bindings.query_required');
  });
}

SourceBindingsStore _store(List<SourceBindingApiDto> items) {
  final catalog = GeneratedSourceBindingCatalog(
    apiClient: InMemorySourceBindingsApiClient(items: items),
  );
  return SourceBindingsStore(
    listSourceBindings: ListSourceBindingsUseCase(catalog),
    bindSourceToTopic: BindSourceToTopicUseCase(catalog),
    changeSourceBindingStatus: ChangeSourceBindingStatusUseCase(catalog),
    loadSourceBindingHealth: LoadSourceBindingHealthUseCase(catalog),
    scope: sourceWorkspaceScope,
    topicId: const SourceTopicId('topic-competitor'),
    topicTitle: 'Competitor launches',
  );
}
