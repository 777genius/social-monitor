import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('renders secondary signals with compact claim trust details', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          narrativeSections: const [
            ReaderSummaryNarrativeSectionApiDto(
              id: 'lead',
              kind: 'lead',
              title: 'Lead',
              text: 'Agent workflows became the strongest daily signal.',
              citationIds: ['bc-1'],
            ),
            ReaderSummaryNarrativeSectionApiDto(
              id: 'secondary-security',
              kind: 'secondary_signal',
              title: 'Security',
              text: 'Browser isolation tools also drew developer attention.',
              citationIds: ['bc-1'],
              storyClusterId: 'security-cluster',
            ),
            ReaderSummaryNarrativeSectionApiDto(
              id: 'secondary-rumor',
              kind: 'secondary_signal',
              title: 'Early report',
              text: 'An unconfirmed product rumor also circulated.',
              citationIds: ['bc-1'],
              storyClusterId: 'rumor-cluster',
            ),
          ],
          claimBoard: const [
            SummaryClaimApiDto(
              id: 'lead',
              claim: 'Agent workflows became the strongest daily signal.',
              evidence: [
                SummaryClaimEvidenceApiDto(
                  title: 'Agent workflow release',
                  providerKey: 'hacker-news',
                  citationId: 'bc-1',
                ),
              ],
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.91,
                rationale: 'Multiple strong signals support this claim.',
              ),
              risks: [],
              citationIds: ['bc-1'],
            ),
            SummaryClaimApiDto(
              id: 'secondary-security',
              claim: 'Browser isolation tools drew developer attention.',
              evidence: [
                SummaryClaimEvidenceApiDto(
                  title: 'Browser isolation release',
                  providerKey: 'hacker-news',
                  citationId: 'bc-1',
                ),
              ],
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.72,
                rationale: 'One strong source group supports this claim.',
              ),
              risks: [
                SummaryClaimRiskApiDto(
                  kind: 'single_source',
                  description: 'Independent confirmation is still limited.',
                ),
              ],
              citationIds: ['bc-1'],
            ),
            SummaryClaimApiDto(
              id: 'secondary-rumor',
              claim: 'An unconfirmed product rumor circulated.',
              evidence: [
                SummaryClaimEvidenceApiDto(
                  title: 'Early product report',
                  providerKey: 'hacker-news',
                  citationId: 'bc-1',
                ),
              ],
              confidence: TopReadConfidenceApiDto(
                level: 'low',
                score: 0.34,
                rationale: 'The report lacks independent support.',
              ),
              risks: [],
              citationIds: ['bc-1'],
            ),
          ],
        ),
      ),
    );
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: ReaderSummaryExecutiveBrief(
            summary: summary,
            citationsById: citationsById,
            onOpenUrl: (_) {},
          ),
        ),
      ),
    );

    expect(find.text('Other signals today'), findsOneWidget);
    expect(find.textContaining('Browser isolation tools'), findsOneWidget);

    final indicator = find.byKey(
      const ValueKey('reader-summary-claim-indicator-secondary-security'),
    );
    expect(indicator, findsOneWidget);
    final confidenceIcon = tester.widget<Icon>(
      find.byKey(const ValueKey('reader-summary-claim-confidence-medium')),
    );
    expect(confidenceIcon.icon, Icons.shield_outlined);
    expect(confidenceIcon.color, AppTheme.light().colorScheme.primary);
    final highConfidenceIcon = tester.widget<Icon>(
      find.byKey(const ValueKey('reader-summary-claim-confidence-high')),
    );
    expect(highConfidenceIcon.icon, Icons.verified_user_outlined);
    expect(highConfidenceIcon.color, AppColors.success);
    final lowConfidenceIcon = tester.widget<Icon>(
      find.byKey(const ValueKey('reader-summary-claim-confidence-low')),
    );
    expect(lowConfidenceIcon.icon, Icons.gpp_maybe_outlined);
    expect(lowConfidenceIcon.color, AppTheme.light().colorScheme.error);

    final textRect = tester.getRect(
      find.byKey(
        const ValueKey('reader-summary-narrative-secondary-security-text'),
      ),
    );
    final trailRect = tester.getRect(
      find.byKey(
        const ValueKey('reader-summary-narrative-secondary-security-trail'),
      ),
    );
    expect(trailRect.left, greaterThanOrEqualTo(textRect.left));
    expect(trailRect.right, lessThanOrEqualTo(textRect.right));
    expect(trailRect.top, greaterThanOrEqualTo(textRect.top));
    expect(trailRect.bottom, lessThanOrEqualTo(textRect.bottom));

    await tester.tap(indicator);
    await tester.pumpAndSettle();

    expect(find.textContaining('Medium confidence, 72%'), findsOneWidget);
    expect(
      find.text('Independent confirmation is still limited.'),
      findsOneWidget,
    );
  });

  testWidgets('renders a unique readable GitHub Watch card with citations', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          narrativeSections: const [
            ReaderSummaryNarrativeSectionApiDto(
              id: 'watch',
              kind: 'watch',
              title: 'GitHub Trending',
              text:
                  '• Watch: '
                  '• codecrafters-io/build-your-own-x: +1,126 stars today. '
                  '• CODECRAFTERS-IO/build-your-own-x: +1,068 stars today. '
                  '• example/second: +1,100 stars today. '
                  '• example/third: +1,050 stars today.',
              citationIds: ['c-strong', 'c-weak', 'c-second', 'c-third'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'c-strong',
            providerKey: 'github-trending-page',
            canonicalUrl: 'https://github.com/codecrafters-io/build-your-own-x',
          ),
          summaryCitationApiDto(
            id: 'c-weak',
            providerKey: 'github-trending-page',
            canonicalUrl: 'https://github.com/codecrafters-io/build-your-own-x',
          ),
          summaryCitationApiDto(
            id: 'c-second',
            providerKey: 'github-trending-page',
            canonicalUrl: 'https://github.com/example/second',
          ),
          summaryCitationApiDto(
            id: 'c-third',
            providerKey: 'github-trending-page',
            canonicalUrl: 'https://github.com/example/third',
          ),
        ],
      ),
    );
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: Scaffold(
          body: ReaderSummaryExecutiveBrief(
            summary: summary,
            citationsById: citationsById,
            onOpenUrl: (_) {},
          ),
        ),
      ),
    );

    final appendix = find.byKey(
      const ValueKey('reader-summary-narrative-watch'),
    );
    final visibleText = tester
        .widgetList<RichText>(
          find.descendant(of: appendix, matching: find.byType(RichText)),
        )
        .map((widget) => widget.text.toPlainText())
        .join('\n');

    expect(find.text('GitHub Trending'), findsOneWidget);
    expect(find.text('Watch'), findsOneWidget);
    expect(
      RegExp(
        'codecrafters-io/build-your-own-x',
        caseSensitive: false,
      ).allMatches(visibleText),
      hasLength(1),
    );
    expect(visibleText, contains('+1,126 stars today.'));
    expect(visibleText, isNot(contains('+1,068 stars today.')));
    expect(visibleText, isNot(contains('•')));
    expect(visibleText, isNot(contains('**')));
    expect(visibleText, isNot(contains('Watch:')));
    expect(
      find.byKey(
        const ValueKey('reader-summary-github-watch-row-0-citation-c-strong'),
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-github-watch-row-0-citation-c-weak'),
      ),
      findsNothing,
    );
    expect(
      find.byKey(
        const ValueKey('reader-summary-github-watch-row-1-citation-c-second'),
      ),
      findsOneWidget,
    );
  });
}
