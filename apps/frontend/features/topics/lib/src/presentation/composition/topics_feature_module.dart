import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/topic_catalog.dart';
import '../../application/use_cases/archive_topic_use_case.dart';
import '../../application/use_cases/create_topic_use_case.dart';
import '../../application/use_cases/list_topics_use_case.dart';
import '../../application/use_cases/update_topic_use_case.dart';
import '../../infrastructure/api/topic_summary_api_dto.dart';
import '../../infrastructure/api_clients/generated_topics_api_client.dart';
import '../../infrastructure/api_clients/in_memory_topics_api_client.dart';
import '../../infrastructure/repositories/generated_topic_catalog.dart';
import '../stores/topics_form_store.dart';
import '../stores/topics_list_store.dart';

final class TopicsFeatureModule extends Module {
  TopicsFeatureModule()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      showLifecycleFilters = true,
      showEditArchiveActions = true,
      onOpenTopicSources = null;

  TopicsFeatureModule.demo({this.onOpenTopicSources})
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      showLifecycleFilters = true,
      showEditArchiveActions = true;

  TopicsFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
    this.onOpenTopicSources,
  }) : showLifecycleFilters = false,
       showEditArchiveActions = false;

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final bool showLifecycleFilters;
  final bool showEditArchiveActions;
  final void Function(String topicId, String topicTitle)? onOpenTopicSources;

  Object get retentionKey {
    if (generatedApiRuntime == null) {
      return 'topics-demo';
    }
    return 'topics-${scope.tenantId}-${scope.workspaceId}';
  }

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    i.registerLazySingleton<TopicsApiClient>(_createApiClient);
    i.registerLazySingleton<TopicCatalog>(
      () => GeneratedTopicCatalog(apiClient: i.get<TopicsApiClient>()),
    );
    i.registerLazySingleton(
      () => TopicsListStore(
        listTopics: ListTopicsUseCase(i.get<TopicCatalog>()),
        scope: scope,
      ),
    );
    i.registerLazySingleton(
      () => TopicsFormStore(
        createTopic: CreateTopicUseCase(i.get<TopicCatalog>()),
        updateTopic: UpdateTopicUseCase(i.get<TopicCatalog>()),
        archiveTopic: ArchiveTopicUseCase(i.get<TopicCatalog>()),
        scope: scope,
      ),
    );
  }

  TopicsApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedTopicsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryTopicsApiClient(items: _demoTopics);
  }
}

const _demoTopics = [
  TopicSummaryApiDto(
    id: 'topic-market-risk',
    name: 'Market risk',
    query: 'market risk OR volatility',
    status: 'active',
    weeklyMentionCount: 24,
  ),
  TopicSummaryApiDto(
    id: 'topic-pricing',
    name: 'Competitor pricing',
    query: 'pricing OR plan change',
    status: 'draft',
    weeklyMentionCount: 8,
  ),
  TopicSummaryApiDto(
    id: 'topic-brand',
    name: 'Brand safety',
    query: 'brand safety OR incident',
    status: 'active',
    weeklyMentionCount: 15,
  ),
];
