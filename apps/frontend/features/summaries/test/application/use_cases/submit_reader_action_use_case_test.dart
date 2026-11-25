import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_reader_action_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('rejects post ratings through generic reader action feedback', () async {
    final catalog = _FakeSummaryReviewCatalog();
    final result = await SubmitReaderActionUseCase(catalog)(
      SubmitReaderActionCommand(
        scope: summaryWorkspaceScope,
        summaryId: 'summary-c-1',
        userId: 'user-demo',
        kind: 'rate_post',
        label: 'Rate top post',
        idempotencyKey: 'ws-demo:summary-c-1:rate_post:feed-c-1:5',
        rating: 5,
        target: const ReaderActionTarget(
          providerKey: 'reddit',
          interestId: 'ai-developer-tools',
          title: 'Reddit thread on agent reliability',
          feedItemId: 'feed-c-1',
          sourceItemId: 'source-c-1',
          citationIds: ['citation-c-1'],
        ),
      ),
    );

    expect(result, isA<ResultFailure<ReaderActionResult>>());
    expect(catalog.readerActionsSubmitted, 0);
  });
}

final class _FakeSummaryReviewCatalog implements SummaryReviewCatalog {
  var readerActionsSubmitted = 0;

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  ) async {
    readerActionsSubmitted += 1;
    return Result.success(
      ReaderActionResult(
        actionId: 'reader-action-c-1',
        idempotencyKey: command.idempotencyKey,
        kind: command.kind,
        created: true,
        learningDirection: 'recorded',
      ),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}
