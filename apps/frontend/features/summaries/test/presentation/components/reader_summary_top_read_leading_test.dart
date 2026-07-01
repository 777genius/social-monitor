import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_top_read_leading.dart';

void main() {
  testWidgets('renders video preview badge for media-backed top reads', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ReaderSummaryTopReadLeading(
            compact: false,
            item: _topRead(
              previewMedia: const PreviewMedia(
                kind: PreviewMediaKind.video,
                url: 'https://cdn.example.test/poster.jpg',
                sourceUrl: 'https://cdn.example.test/video.mp4',
                altText: 'Launch demo video',
              ),
            ),
          ),
        ),
      ),
    );

    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    expect(find.byIcon(Icons.article_outlined), findsNothing);
  });
}

TopRead _topRead({PreviewMedia? previewMedia}) {
  return TopRead(
    title: 'X post includes a launch image',
    providerKey: 'x-twitter',
    reason: 'Visual launch evidence is easier to scan.',
    matchedInterestIds: const ['ai-tools'],
    matchedRules: const ['interest:ai-tools'],
    signalScore: SignalScore.normalized(1.7),
    confidence: const TopReadConfidence(
      level: 'medium',
      score: 0.68,
      rationale: 'Source metrics are enough for display.',
    ),
    confirmedProviderKeys: const ['x-twitter'],
    providerMetrics: const [],
    whyImportant: const ['Visual launch evidence is easier to scan.'],
    whyNow: 'Current summary window has X/Twitter coverage.',
    citationIds: const ['c1'],
    canonicalUrl: 'https://x.com/example/status/1',
    previewMedia: previewMedia,
  );
}
