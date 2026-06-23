import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/application/commands/archive_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/create_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/update_topic_command.dart';
import 'package:social_monitor_topics/src/application/contracts/topic_catalog.dart';
import 'package:social_monitor_topics/src/application/queries/list_topics_query.dart';
import 'package:social_monitor_topics/src/application/use_cases/archive_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/create_topic_use_case.dart';
import 'package:social_monitor_topics/src/application/use_cases/update_topic_use_case.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_id.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_name.dart';
import 'package:social_monitor_topics/src/domain/value_objects/topic_query.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test(
    'create topic validates expected failures before repository call',
    () async {
      final catalog = _MutationCatalog();
      final useCase = CreateTopicUseCase(catalog);

      final result = await useCase(
        const CreateTopicCommand(
          scope: testWorkspaceScope,
          name: TopicName('A'),
          query: TopicQuery('market risk'),
          idempotencyKey: 'topic-create-1',
        ),
      );

      expect(result, isA<ResultFailure<TopicSummary>>());
      expect(catalog.createCalls, 0);
    },
  );

  test('create update and archive call catalog on valid commands', () async {
    final catalog = _MutationCatalog();

    await CreateTopicUseCase(catalog)(
      const CreateTopicCommand(
        scope: testWorkspaceScope,
        name: TopicName('Market risk'),
        query: TopicQuery('market risk'),
        idempotencyKey: 'topic-create-1',
      ),
    );
    await UpdateTopicUseCase(catalog)(
      const UpdateTopicCommand(
        scope: testWorkspaceScope,
        topicId: TopicId('topic-market-risk'),
        name: TopicName('Market risk updated'),
        query: TopicQuery('market risk OR pricing'),
      ),
    );
    await ArchiveTopicUseCase(catalog)(
      const ArchiveTopicCommand(
        scope: testWorkspaceScope,
        topicId: TopicId('topic-market-risk'),
      ),
    );

    expect(catalog.createCalls, 1);
    expect(catalog.updateCalls, 1);
    expect(catalog.archiveCalls, 1);
  });
}

final class _MutationCatalog implements TopicCatalog {
  var createCalls = 0;
  var updateCalls = 0;
  var archiveCalls = 0;

  @override
  Future<Result<TopicSummary>> archiveTopic(ArchiveTopicCommand command) async {
    archiveCalls += 1;
    return Result.success(topicSummary());
  }

  @override
  Future<Result<TopicSummary>> createTopic(CreateTopicCommand command) async {
    createCalls += 1;
    return Result.success(topicSummary());
  }

  @override
  Future<Result<PageResult<TopicSummary>>> listTopics(
    ListTopicsQuery query,
  ) async {
    return Result.success(topicSummaryPage([topicSummary()]));
  }

  @override
  Future<Result<TopicSummary>> updateTopic(UpdateTopicCommand command) async {
    updateCalls += 1;
    return Result.success(topicSummary());
  }
}
