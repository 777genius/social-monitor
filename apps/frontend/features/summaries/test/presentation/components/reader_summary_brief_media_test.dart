import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders real preview media in the brief top-read cards', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'RSS post with a video poster',
              providerKey: 'rss',
              reason: 'The source item includes a real media thumbnail.',
              matchedInterestIds: ['ai-tools'],
              matchedRules: ['interest:ai-tools'],
              signalScore: 0.91,
              providerMetrics: [
                ProviderMetricApiDto(label: 'Engagement', value: 'high'),
              ],
              whyImportant: ['The real provider metadata has media.'],
              whyNow: 'Current summary window includes RSS coverage.',
              canonicalUrl: 'https://example.test/rss-post',
              previewMedia: PreviewMediaApiDto(
                kind: 'video',
                url: 'https://cdn.example.test/rss-poster.jpg',
                sourceUrl: 'https://cdn.example.test/rss-video.mp4',
                altText: 'RSS video poster',
              ),
              citationIds: ['bc-1'],
            ),
          ],
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryBriefSurface(
              summary: summary,
              citationsById: {
                for (final citation in summary.citations) citation.id: citation,
              },
              isRefreshing: false,
              onOpenUrl: (_) {},
            ),
          ),
        ),
      ),
    );

    expect(find.byType(Image), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
  });
}
