import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('shows explicit degraded collection state for a provider', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 12,
          selectedFeedItemCount: 8,
          topReadCount: 2,
          citationCount: 8,
          collectionCoverageState: 'degraded',
          degradedProviderKeys: ['x-twitter'],
          providerBreakdown: [
            ReaderSummaryProviderCoverageApiDto(
              providerKey: 'x-twitter',
              collectedFeedItemCount: 12,
              selectedFeedItemCount: 8,
              topReadCount: 2,
              citationCount: 8,
              collectionHealth: ReaderSummaryProviderCollectionHealthApiDto(
                state: 'degraded',
                scanCount: 1,
                targetItemCount: 80,
                collectedItemCount: 16,
                acceptedItemCount: 12,
                insertedItemCount: 10,
                outsideWindowItemCount: 4,
                paginationDuplicateItemCount: 2,
                storageDuplicateItemCount: 2,
                pageCount: 2,
                paginationStopReasons: ['partial_retryable_failure'],
                failureKinds: ['rate_limited'],
                rateLimitEventCount: 1,
              ),
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: ReaderSummaryCoverageBySourceBand(summary: summary),
        ),
      ),
    );

    expect(
      find.textContaining('Degraded collection: 12 of 80 accepted'),
      findsOneWidget,
    );
    expect(
      find.byTooltip(
        'Degraded collection: 12 of 80 accepted. 1 rate-limit event. Failure: rate_limited. Stopped: partial_retryable_failure',
      ),
      findsOneWidget,
    );
  });
}
