import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/archive_topic_use_case.dart';
import '../../application/use_cases/create_topic_use_case.dart';
import '../../application/use_cases/list_topics_use_case.dart';
import '../../application/use_cases/update_topic_use_case.dart';
import '../../infrastructure/api/topic_summary_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_topics_api_client.dart';
import '../../infrastructure/repositories/generated_topic_catalog.dart';
import '../pages/topics_feature_page.dart';
import '../stores/topics_form_store.dart';
import '../stores/topics_list_store.dart';

class TopicsFeatureModuleHost extends StatefulWidget {
  const TopicsFeatureModuleHost({super.key});

  @override
  State<TopicsFeatureModuleHost> createState() =>
      _TopicsFeatureModuleHostState();
}

class _TopicsFeatureModuleHostState extends State<TopicsFeatureModuleHost> {
  late final TopicsListStore _store;
  late final TopicsFormStore _formStore;

  @override
  void initState() {
    super.initState();
    final catalog = GeneratedTopicCatalog(
      apiClient: InMemoryTopicsApiClient(items: _demoTopics),
    );
    const scope = WorkspaceScope(
      tenantId: 'tenant-demo',
      workspaceId: 'ws-demo',
    );
    _store = TopicsListStore(
      listTopics: ListTopicsUseCase(catalog),
      scope: scope,
    );
    _formStore = TopicsFormStore(
      createTopic: CreateTopicUseCase(catalog),
      updateTopic: UpdateTopicUseCase(catalog),
      archiveTopic: ArchiveTopicUseCase(catalog),
      scope: scope,
    );
  }

  @override
  void dispose() {
    _store.dispose();
    _formStore.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TopicsFeaturePage(store: _store, formStore: _formStore);
  }
}

const _demoTopics = [
  TopicSummaryApiDto(
    id: 'topic-market-risk',
    name: 'Market risk',
    status: 'active',
    weeklyMentionCount: 24,
  ),
  TopicSummaryApiDto(
    id: 'topic-pricing',
    name: 'Competitor pricing',
    status: 'draft',
    weeklyMentionCount: 8,
  ),
  TopicSummaryApiDto(
    id: 'topic-brand',
    name: 'Brand safety',
    status: 'active',
    weeklyMentionCount: 15,
  ),
];
