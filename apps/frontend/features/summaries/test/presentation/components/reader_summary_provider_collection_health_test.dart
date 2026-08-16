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

    expect(find.text('12 reviewed'), findsOneWidget);
    expect(find.text('8 used (67%) · 4 not selected'), findsOneWidget);
    expect(
      find.byTooltip(
        '12 unique posts were reviewed. 8 posts were used in this summary. 4 posts were not selected. 2 top reads. 8 citations.',
      ),
      findsOneWidget,
    );
    expect(
      find.byTooltip(
        'Degraded collection: 12 of 80 accepted. 16 candidates checked. 4 posts outside the summary date. 4 duplicate results. 10 new posts saved. Provider rate limit reached once. Collection stopped early after a temporary provider error.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('hides recovered account errors after the final target is met', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 100,
          selectedFeedItemCount: 30,
          topReadCount: 8,
          citationCount: 30,
          collectionCoverageState: 'complete',
          providerBreakdown: [
            ReaderSummaryProviderCoverageApiDto(
              providerKey: 'x-twitter',
              collectedFeedItemCount: 100,
              selectedFeedItemCount: 30,
              topReadCount: 8,
              citationCount: 30,
              collectionHealth: ReaderSummaryProviderCollectionHealthApiDto(
                state: 'complete',
                scanCount: 1,
                targetItemCount: 100,
                collectedItemCount: 120,
                acceptedItemCount: 100,
                insertedItemCount: 40,
                outsideWindowItemCount: 0,
                paginationDuplicateItemCount: 10,
                storageDuplicateItemCount: 10,
                pageCount: 3,
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
      find.byTooltip(
        '100 of 100 accepted. 120 candidates checked. 20 duplicate results. 40 new posts saved.',
      ),
      findsOneWidget,
    );
    expect(find.textContaining('rate limit'), findsNothing);
  });

  testWidgets('shows reviewed, used and not-selected counts without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 640);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        coverage: const ReaderSummaryCoverageApiDto(
          collectedFeedItemCount: 66,
          selectedFeedItemCount: 30,
          topReadCount: 8,
          citationCount: 30,
          providerBreakdown: [
            ReaderSummaryProviderCoverageApiDto(
              providerKey: 'rss',
              collectedFeedItemCount: 66,
              selectedFeedItemCount: 30,
              topReadCount: 8,
              citationCount: 30,
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

    expect(find.text('66 reviewed'), findsOneWidget);
    expect(find.text('30 used (45%) · 36 not selected'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
