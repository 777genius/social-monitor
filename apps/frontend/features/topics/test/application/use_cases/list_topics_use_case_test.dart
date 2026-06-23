import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_topics/src/application/commands/archive_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/create_topic_command.dart';
import 'package:social_monitor_topics/src/application/commands/update_topic_command.dart';
import 'package:social_monitor_topics/src/application/contracts/topic_catalog.dart';
import 'package:social_monitor_topics/src/application/queries/list_topics_query.dart';
import 'package:social_monitor_topics/src/application/use_cases/list_topics_use_case.dart';
import 'package:social_monitor_topics/src/domain/entities/topic_summary.dart';

import '../../support/topics_test_fixtures.dart';

void main() {
  test('returns a paged topic list through Result', () async {
    final useCase = ListTopicsUseCase(
      _FakeTopicCatalog(Result.success(topicSummaryPage([topicSummary()]))),
    );

    final result = await useCase(
      const ListTopicsQuery(scope: testWorkspaceScope),
    );

    expect(result, isA<ResultSuccess<PageResult<TopicSummary>>>());
    final page = (result as ResultSuccess<PageResult<TopicSummary>>).value;
    expect(page.items.single.name.value, 'Market risk');
  });

  test('rejects missing workspace scope before infrastructure call', () async {
    final catalog = _FakeTopicCatalog(
      Result.success(topicSummaryPage([topicSummary()])),
    );
    final useCase = ListTopicsUseCase(catalog);

    final result = await useCase(
      const ListTopicsQuery(
        scope: WorkspaceScope(tenantId: '', workspaceId: ''),
      ),
    );

    expect(result, isA<ResultFailure<PageResult<TopicSummary>>>());
    expect(catalog.calls, 0);
  });
}

final class _FakeTopicCatalog implements TopicCatalog {
  _FakeTopicCatalog(this._result);

  final Result<PageResult<TopicSummary>> _result;
  int calls = 0;

  @override
  Future<Result<PageResult<TopicSummary>>> listTopics(
    ListTopicsQuery query,
  ) async {
    calls += 1;
    return _result;
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
