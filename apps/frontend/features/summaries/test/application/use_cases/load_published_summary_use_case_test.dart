import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/queries/load_published_summary_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_published_summary_use_case.dart';

import '../../support/deferred_summary_review_catalog.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  test('loads a published summary through the review catalog', () async {
    final useCase = LoadPublishedSummaryUseCase(
      DeferredSummaryReviewCatalog(const []),
    );

    final result = await useCase(
      const LoadPublishedSummaryQuery(
        scope: summaryWorkspaceScope,
        summaryId: 'reader-summary-1',
      ),
    );

    expect(result, isA<ResultSuccess>());
  });

  test('rejects a blank published summary id before loading', () async {
    final useCase = LoadPublishedSummaryUseCase(
      DeferredSummaryReviewCatalog(const []),
    );

    final result = await useCase(
      const LoadPublishedSummaryQuery(
        scope: summaryWorkspaceScope,
        summaryId: '   ',
      ),
    );

    expect(result, isA<ResultFailure>());
    expect(
      (result as ResultFailure).failure.code,
      'summaries.published_summary_id_required',
    );
  });
}
