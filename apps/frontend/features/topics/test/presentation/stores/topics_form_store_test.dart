import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/application/use_cases/archive_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/create_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/update_topic_use_case.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';
import 'package:social_monitor_topics/src/infrastructure/api_clients/in_memory_topics_api_client.dart';
import 'package:social_monitor_topics/src/infrastructure/repositories/generated_topic_catalog.dart';
import 'package:social_monitor_topics/src/presentation/stores/topics_form_store.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('validates create form before saving', () async {
    final store = _formStore();

    store.beginCreate();
    store.updateName('A');
    store.updateQueryText('market risk');
    final result = await store.save();

    expect(result, isA<ResultFailure<TopicSummary>>());
    expect(store.state, isA<FailureViewState<TopicSummary>>());
  });

  test('creates updates and archives through use cases', () async {
    final store = _formStore();

    store.beginCreate();
    store.updateName('Market risk');
    store.updateQueryText('market risk OR pricing');
    final created = await store.save();

    expect(created, isA<ResultSuccess<TopicSummary>>());

    final topic = (created as ResultSuccess<TopicSummary>).value;
    store.beginEdit(topic);
    store.updateName('Market risk updated');
    store.updateQueryText('market risk');
    final updated = await store.save();

    expect(updated, isA<ResultSuccess<TopicSummary>>());
    final archived = await store.archive(topic);
    expect(archived, isA<ResultSuccess<TopicSummary>>());
  });
}

TopicsFormStore _formStore() {
  final catalog = GeneratedTopicCatalog(
    apiClient: InMemoryTopicsApiClient(items: [topicSummaryApiDto()]),
  );
  return TopicsFormStore(
    createTopic: CreateTopicUseCase(catalog),
    updateTopic: UpdateTopicUseCase(catalog),
    archiveTopic: ArchiveTopicUseCase(catalog),
    scope: testWorkspaceScope,
  );
}
