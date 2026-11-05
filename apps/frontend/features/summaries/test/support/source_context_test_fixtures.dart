import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';

import 'top_posts_test_fixtures.dart';

const sourceContextText =
    'Atlas bypasses approval. Only in simulations; '
    'production requires human approval.';

const sourceContextCitation = SummaryCitation(
  id: 'synthetic-citation',
  sourceLabel: 'Source',
  safeSnippet: sourceContextText,
  feedItemId: 'synthetic-feed',
  sourceItemId: 'synthetic-item',
  providerKey: 'reddit',
  canonicalUrl: 'https://example.test/evidence',
);

ReaderSummary sourceContextSummary() {
  final base = topPostsSummaryFixture(
    topReads: [
      topPostFixture(
        title: sourceContextText,
        cardKind: ReaderSummaryCardKind.curatedTopRead,
        storyClusterId: 'synthetic-context',
      ),
    ],
  );
  return ReaderSummary(
    id: base.id,
    title: base.title,
    executiveSummary: 'Synthetic summary.',
    userId: null,
    content: ReaderSummaryContent(
      headline: '',
      oneLineTakeaway: '',
      bullets: const [],
      qualityState: base.content.qualityState,
      interestSections: const [],
      sourceMix: const [],
      topReads: base.content.topReads,
      trendDelta: base.content.trendDelta,
      openQuestions: const [],
      risks: const [],
      nextActions: const [],
    ),
    topStories: const [],
    repeatedSignals: const [],
    citations: const [],
    period: base.period,
    summaryWindow: base.summaryWindow,
    freshnessLabel: base.freshnessLabel,
    isDegraded: false,
  );
}
