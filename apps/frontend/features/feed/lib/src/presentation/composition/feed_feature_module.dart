import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/feed_item_catalog.dart';
import '../../application/use_cases/list_feed_items_use_case.dart';
import '../../application/use_cases/load_feed_item_use_case.dart';
import '../../infrastructure/api_clients/feed_items_api_client.dart';
import '../../infrastructure/api_clients/generated_feed_items_api_client.dart';
import '../../infrastructure/api_clients/in_memory_feed_items_api_client.dart';
import '../../infrastructure/repositories/generated_feed_item_catalog.dart';
import '../stores/feed_items_store.dart';
import 'feed_feature_demo_fixtures.dart';

final class FeedFeatureModule extends Module {
  FeedFeatureModule()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      initialInterestId = null,
      initialInterestTitle = null;

  FeedFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
    this.initialInterestId,
    this.initialInterestTitle,
  });

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final String? initialInterestId;
  final String? initialInterestTitle;

  Object get retentionKey {
    final topicPart = initialInterestId == null
        ? 'all'
        : initialInterestId!.trim();
    return 'feed-${scope.tenantId}-${scope.workspaceId}-$topicPart';
  }

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    i.registerLazySingleton<FeedItemsApiClient>(_createApiClient);
    i.registerLazySingleton<FeedItemCatalog>(
      () => GeneratedFeedItemCatalog(apiClient: i.get<FeedItemsApiClient>()),
    );
    i.registerLazySingleton(
      () => FeedItemsStore(
        listFeedItems: ListFeedItemsUseCase(i.get<FeedItemCatalog>()),
        loadFeedItem: LoadFeedItemUseCase(i.get<FeedItemCatalog>()),
        scope: scope,
        initialInterestId: initialInterestId,
      ),
    );
  }

  FeedItemsApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedFeedItemsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryFeedItemsApiClient(items: feedFeatureDemoItems());
  }
}
