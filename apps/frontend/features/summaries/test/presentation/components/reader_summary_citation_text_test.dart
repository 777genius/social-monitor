import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/entities/summary_citation.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_citation_text.dart';

void main() {
  test('hides technical citation snippets from reader-facing summary UI', () {
    expect(
      readerSummaryDisplayCitationSnippet(
        const SummaryCitation(
          id: 'c1',
          sourceLabel: 'Hacker News',
          safeSnippet:
              'Hacker News citation references title evidence from source item feed:source-binding-live-multi-provider-hacker-news:hn:48706690.',
        ),
      ),
      isNull,
    );

    expect(
      readerSummaryDisplayCitationSnippet(
        const SummaryCitation(
          id: 'c2',
          sourceLabel: 'X/Twitter',
          safeSnippet: 'X/Twitter citation references bodyPreview evidence.',
        ),
      ),
      isNull,
    );
  });

  test('keeps concrete citation snippets', () {
    expect(
      readerSummaryDisplayCitationSnippet(
        const SummaryCitation(
          id: 'c3',
          sourceLabel: 'Reddit',
          safeSnippet: 'Developers compare local model performance tradeoffs.',
        ),
      ),
      'Developers compare local model performance tradeoffs.',
    );
  });
}
