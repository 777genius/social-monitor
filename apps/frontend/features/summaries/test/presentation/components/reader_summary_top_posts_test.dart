import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/post_rating.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('ranks supported and engaged posts above single-source ties', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'HN single-source low-engagement debate',
              providerKey: 'hacker-news',
              reason: 'A single HN item has close normalized signal.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.3,
              confidence: TopReadConfidenceApiDto(
                level: 'low',
                score: 0.42,
                rationale: 'Single-source story signal.',
              ),
              providerMetrics: [
                ProviderMetricApiDto(label: 'Points', value: '35'),
                ProviderMetricApiDto(label: 'Comments', value: '59'),
              ],
              citationIds: ['bc-1'],
            ),
            TopReadApiDto(
              title: 'Reddit same-source support with strong engagement',
              providerKey: 'reddit',
              reason: 'Two Reddit items support the story.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.24,
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.55,
                rationale:
                    'Two source items support this story, but from one provider.',
              ),
              confirmedProviderKeys: ['reddit'],
              providerMetrics: [
                ProviderMetricApiDto(
                  label: 'Reddit evidence',
                  value: '4,940 score, 209 comments, 98% upvoted',
                ),
              ],
              citationIds: ['bc-2'],
            ),
            TopReadApiDto(
              title: 'Cross-source workflow story',
              providerKey: 'x-twitter',
              reason: 'X and RSS both discuss the workflow.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.12,
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.76,
                rationale: 'Two providers confirm this story signal.',
              ),
              confirmedProviderKeys: ['x-twitter', 'rss'],
              providerMetrics: [
                ProviderMetricApiDto(label: 'Likes', value: '959'),
                ProviderMetricApiDto(label: 'Reposts', value: '233'),
              ],
              citationIds: ['bc-3'],
            ),
          ],
          reliabilityReport: const SummaryReliabilityReportApiDto(
            mode: 'shadow',
            policyVersion: 'reader_summary_reliability_shadow_v1',
            riskLevel: 'medium',
            riskScore: 0.52,
            risks: [
              SummaryReliabilityRiskApiDto(
                kind: 'single_source',
                level: 'medium',
                score: 0.52,
                description:
                    'Important claims are not confirmed across providers yet.',
              ),
            ],
          ),
        ),
        citations: [
          summaryCitationApiDto(id: 'bc-1', providerKey: 'hacker-news'),
          summaryCitationApiDto(id: 'bc-2', providerKey: 'reddit'),
          summaryCitationApiDto(id: 'bc-3', providerKey: 'x-twitter'),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    expect(
      find.descendant(
        of: find.byKey(const ValueKey('reader-summary-top-post-0')),
        matching: find.text('Cross-source workflow story'),
      ),
      findsOneWidget,
    );
    expect(find.text('Cross-source'), findsOneWidget);
    expect(find.text('Same-source support'), findsOneWidget);
    expect(find.text('Single source'), findsWidgets);
    expect(find.text('Low relevance'), findsNothing);
    expect(find.text('Shares'), findsNothing);
    expect(find.text('Views'), findsNothing);
  });

  testWidgets('submits a star rating for a concrete top post', (tester) async {
    String? ratedTitle;
    int? submittedRating;
    PostRatingReason? submittedReason;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'Reddit thread with actionable feedback',
              providerKey: 'reddit',
              reason: 'Users explain why the workflow matters.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 3.1,
              confidence: TopReadConfidenceApiDto(
                level: 'high',
                score: 0.82,
                rationale: 'Multiple citations support the post.',
              ),
              citationIds: ['rating-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'rating-citation',
            providerKey: 'reddit',
            feedItemId: 'feed-rating-1',
            sourceItemId: 'source-rating-1',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      _TestApp(
        summary: summary,
        onTopPostRating: (item, rating, reason) async {
          ratedTitle = item.title;
          submittedRating = rating;
          submittedReason = reason;
          return true;
        },
      ),
    );
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
    final ratingSlotFinder = find.descendant(
      of: rowFinder,
      matching: find.byKey(
        const ValueKey('reader-summary-top-post-rating-slot'),
      ),
    );
    expect(tester.widget<AnimatedOpacity>(ratingSlotFinder).opacity, 0);

    final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
    addTearDown(gesture.removePointer);
    await gesture.addPointer(location: Offset.zero);
    await gesture.moveTo(tester.getCenter(rowFinder));
    await tester.pumpAndSettle();

    expect(tester.widget<AnimatedOpacity>(ratingSlotFinder).opacity, 1);

    await tester.tap(
      find.descendant(
        of: rowFinder,
        matching: find.byKey(
          const ValueKey('reader-summary-top-post-rating-4'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(ratedTitle, 'Reddit thread with actionable feedback');
    expect(submittedRating, 4);
    expect(submittedReason, isNull);
    expect(find.text('Saved'), findsOneWidget);

    await gesture.moveTo(Offset.zero);
    await tester.pumpAndSettle();

    expect(tester.widget<AnimatedOpacity>(ratingSlotFinder).opacity, 1);
  });

  testWidgets('requires a reason before submitting a 1-star rating', (
    tester,
  ) async {
    int? submittedRating;
    PostRatingReason? submittedReason;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: const [
            TopReadApiDto(
              title: 'Reddit thread with weak evidence',
              providerKey: 'reddit',
              reason: 'The source does not support the claim.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 1.8,
              confidence: TopReadConfidenceApiDto(
                level: 'low',
                score: 0.31,
                rationale: 'Single weak source.',
              ),
              citationIds: ['weak-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'weak-citation',
            providerKey: 'reddit',
            feedItemId: 'feed-weak-1',
            sourceItemId: 'source-weak-1',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      _TestApp(
        summary: summary,
        onTopPostRating: (item, rating, reason) async {
          submittedRating = rating;
          submittedReason = reason;
          return true;
        },
      ),
    );
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(const ValueKey('reader-summary-top-post-0'));
    final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
    addTearDown(gesture.removePointer);
    await gesture.addPointer(location: Offset.zero);
    await gesture.moveTo(tester.getCenter(rowFinder));
    await tester.pumpAndSettle();

    await tester.tap(
      find.descendant(
        of: rowFinder,
        matching: find.byKey(
          const ValueKey('reader-summary-top-post-rating-1'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('reader-summary-post-rating-reason-dialog')),
      findsOneWidget,
    );
    expect(submittedRating, isNull);

    await tester.tap(
      find.byKey(
        const ValueKey('reader-summary-post-rating-reason-weak_source'),
      ),
    );
    await tester.pumpAndSettle();

    expect(submittedRating, 1);
    expect(submittedReason, PostRatingReason.weakSource);
    expect(find.text('Saved'), findsOneWidget);
  });

  testWidgets('shows compact claim board and expands cited evidence', (
    tester,
  ) async {
    String? openedUrl;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          claimBoard: const [
            SummaryClaimApiDto(
              claim: 'Reddit users report useful MCP agent workflows',
              evidence: [
                SummaryClaimEvidenceApiDto(
                  title: 'Thread evidence about MCP agent workflows',
                  providerKey: 'reddit',
                  citationId: 'claim-citation',
                  canonicalUrl: 'https://reddit.example/r/mcp/comments/1',
                ),
              ],
              confidence: TopReadConfidenceApiDto(
                level: 'medium',
                score: 0.63,
                rationale: 'Cited Reddit source with usable discussion.',
              ),
              risks: [
                SummaryClaimRiskApiDto(
                  kind: 'single_source',
                  description: 'Single-source claim; wait for confirmation.',
                ),
              ],
              citationIds: ['claim-citation'],
            ),
          ],
          reliabilityReport: const SummaryReliabilityReportApiDto(
            mode: 'shadow',
            policyVersion: 'reader_summary_reliability_shadow_v1',
            riskLevel: 'medium',
            riskScore: 0.52,
            risks: [
              SummaryReliabilityRiskApiDto(
                kind: 'single_source',
                level: 'medium',
                score: 0.52,
                description:
                    'Important claims are not confirmed across providers yet.',
              ),
            ],
          ),
        ),
        citations: [
          summaryCitationApiDto(id: 'bc-1', providerKey: 'github-repo-radar'),
          summaryCitationApiDto(
            id: 'claim-citation',
            sourceLabel: 'Reddit [1]',
            providerKey: 'reddit',
            canonicalUrl: 'https://reddit.example/r/mcp/comments/1',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      _TestApp(summary: summary, onOpenUrl: (url) => openedUrl = url),
    );
    await tester.pumpAndSettle();

    expect(find.text('Claim board'), findsOneWidget);
    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsOneWidget,
    );
    expect(find.text('medium confidence 63%'), findsOneWidget);
    expect(find.text('1 risk'), findsOneWidget);
    expect(find.text('Reliability'), findsOneWidget);
    expect(find.text('Medium risk 52%'), findsOneWidget);
    expect(find.text('Single source'), findsWidgets);
    expect(find.textContaining('Thread evidence about MCP'), findsNothing);

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-claim-board-expand-0')),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Thread evidence about MCP'), findsOneWidget);
    expect(
      find.text('Single-source claim; wait for confirmation.'),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Open source'));
    expect(openedUrl, 'https://reddit.example/r/mcp/comments/1');
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.summary, this.onTopPostRating, this.onOpenUrl});

  final ReaderSummary summary;
  final ValueChanged<String>? onOpenUrl;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onTopPostRating;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ReaderSummaryView(
                summary: summary,
                isRefreshing: false,
                readerActionState: const InitialViewState<ReaderActionResult>(),
                activeReaderActionIdempotencyKey: null,
                lastReaderActionIdempotencyKey: null,
                onGenerate: () {},
                intentForAction: (_) =>
                    const UserActionIntent(id: 'test-action'),
                onAction: (action, [reason]) {},
                topPostRatingFor: (_) => null,
                onTopPostRating: onTopPostRating ?? (_, _, _) async => true,
                onOpenUrl: onOpenUrl ?? (_) {},
              ),
            ),
          ),
        ),
      ),
    );
  }
}
