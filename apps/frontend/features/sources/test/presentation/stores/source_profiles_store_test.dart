import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_source_profiles_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/source_profile.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_profile_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_source_profiles_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_profile_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/source_profiles_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('loads profiles and toggles limitations expansion', () async {
    final store = _store([
      sourceProfileApiDto(),
      sourceProfileApiDto(
        providerKey: 'hn',
        displayName: 'Hacker News',
        readinessState: 'profiled',
        runtimeReadiness: 'deferred',
      ),
    ]);

    await store.load();

    final state = store.state as ReadyViewState<PageResult<SourceProfile>>;
    expect(state.value.items, hasLength(2));
    expect(state.value.items.last.isDegraded, isTrue);

    final redditKey = state.value.items.first.providerKey;
    expect(store.isExpanded(redditKey), isFalse);
    store.toggleLimitations(redditKey);
    expect(store.isExpanded(redditKey), isTrue);
  });

  test('workspace switch clears profile state and stale operation result', () {
    final store = _store([sourceProfileApiDto()]);

    store.updateScope(
      const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
    );

    expect(store.state, isA<InitialViewState<PageResult<SourceProfile>>>());
  });
}

SourceProfilesStore _store(List<SourceProfileApiDto> items) {
  final catalog = GeneratedSourceProfileCatalog(
    apiClient: InMemorySourceProfilesApiClient(items: items),
  );
  return SourceProfilesStore(
    listSourceProfiles: ListSourceProfilesUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}
