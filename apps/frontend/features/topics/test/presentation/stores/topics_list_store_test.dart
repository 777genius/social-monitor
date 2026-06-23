import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/application/commands/archive_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/create_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/update_topic_command.dart';
import 'package:social_monitor_topics/src/application/contracts/topic_catalog.dart';
import 'package:social_monitor_topics/src/application/queries/list_topics_query.dart';
import 'package:social_monitor_topics/src/application/use_cases/list_topics_use_case.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';
import 'package:social_monitor_topics/src/presentation/stores/topics_list_store.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('loads topics into typed async state', () async {
    final store = TopicsListStore(
      listTopics: ListTopicsUseCase(
        _QueuedTopicCatalog([
          Result.success(topicSummaryPage([topicSummary()])),
        ]),
      ),
      scope: testWorkspaceScope,
    );

    await store.load();

    expect(store.state, isA<ReadyViewState<PageResult<TopicSummary>>>());
  });

  test('rejects stale results from older load operations', () async {
    final catalog = _CompleterTopicCatalog();
    final store = TopicsListStore(
      listTopics: ListTopicsUseCase(catalog),
      scope: testWorkspaceScope,
    );

    final firstLoad = store.load(search: 'first');
    await Future<void>.delayed(Duration.zero);
    final secondLoad = store.load(search: 'second');
    await Future<void>.delayed(Duration.zero);

    catalog.completeAt(
      1,
      Result.success(topicSummaryPage([topicSummary(name: 'Second topic')])),
    );
    await secondLoad;

    catalog.completeAt(
      0,
      Result.success(topicSummaryPage([topicSummary(name: 'First topic')])),
    );
    await firstLoad;

    final state = store.state as ReadyViewState<PageResult<TopicSummary>>;
    expect(state.value.items.single.name.value, 'Second topic');
  });

  test('exposes typed create and archive action intents', () {
    final store = TopicsListStore(
      listTopics: ListTopicsUseCase(
        _QueuedTopicCatalog([
          Result.success(topicSummaryPage([topicSummary()])),
        ]),
      ),
      scope: testWorkspaceScope,
    );
    final topic = topicSummary();

    expect(store.createTopicIntent.id, 'topics.create');
    expect(store.archiveIntentFor(topic).risk, UserActionRisk.destructive);
    expect(store.archiveIntentFor(topic).requiresConfirmation, isTrue);
    expect(
      store.archiveIntentFor(topic).idempotencyKey,
      'workspace-demo:topic-market-risk:archive',
    );
  });
}

final class _QueuedTopicCatalog implements TopicCatalog {
  _QueuedTopicCatalog(this._results);

  final List<Result<PageResult<TopicSummary>>> _results;
  var _index = 0;

  @override
  Future<Result<PageResult<TopicSummary>>> listTopics(
    ListTopicsQuery query,
  ) async {
    final result = _results[_index];
    _index += 1;
    return result;
  }

  @override
  Future<Result<TopicSummary>> archiveTopic(ArchiveTopicCommand command) async {
    return Result.success(topicSummary());
  }

  @override
  Future<Result<TopicSummary>> createTopic(CreateTopicCommand command) async {
    return Result.success(topicSummary());
  }

  @override
  Future<Result<TopicSummary>> updateTopic(UpdateTopicCommand command) async {
    return Result.success(topicSummary());
  }
}

final class _CompleterTopicCatalog implements TopicCatalog {
  final _completers = <Completer<Result<PageResult<TopicSummary>>>>[];

  @override
  Future<Result<PageResult<TopicSummary>>> listTopics(ListTopicsQuery query) {
    final completer = Completer<Result<PageResult<TopicSummary>>>();
    _completers.add(completer);
    return completer.future;
  }

  @override
  Future<Result<TopicSummary>> archiveTopic(ArchiveTopicCommand command) async {
    return Result.success(topicSummary());
  }

  @override
  Future<Result<TopicSummary>> createTopic(CreateTopicCommand command) async {
    return Result.success(topicSummary());
  }

  @override
  Future<Result<TopicSummary>> updateTopic(UpdateTopicCommand command) async {
    return Result.success(topicSummary());
  }

  void completeAt(int index, Result<PageResult<TopicSummary>> result) {
    _completers[index].complete(result);
  }
}
