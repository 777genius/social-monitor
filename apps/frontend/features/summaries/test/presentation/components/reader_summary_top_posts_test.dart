import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/post_rating.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_recommendation.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';

import '../../support/summaries_test_fixtures.dart';

part 'reader_summary_top_posts_test_trust.dart';
part 'reader_summary_top_posts_test_app.dart';

void main() {
  testWidgets('shows topic map on the reader summary page', (tester) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );

    await tester.pumpWidget(_TestApp(summary: summary, showTopicMap: true));
    await tester.pumpAndSettle();

    final topicMap = find.byType(
      ReaderSummaryTopicMapPanel,
      skipOffstage: false,
    );
    expect(topicMap, findsOneWidget);
    expect(find.text('Topic map'), findsNothing);
    expect(
      find.byKey(
        const ValueKey('topic-map-bubble-topic:story:ai-tools'),
        skipOffstage: false,
      ),
      findsOneWidget,
    );
  });

  testWidgets('shows each top post published date, not summary period date', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        period: summaryPeriodApiDto(
          startedAt: DateTime.utc(2026, 7, 6),
          endedAt: DateTime.utc(2026, 7, 7),
          periodKey:
              'daily:2026-07-06T00:00:00.000Z:2026-07-07T00:00:00.000Z:UTC',
        ),
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              storyClusterId: 'story:older-post',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:older-post',
              ),
              title: 'Older post should show its real date',
              providerKey: 'reddit',
              reason: 'Regression check for per-post publishedAt rendering.',
              matchedInterestIds: ['ai-developer-tools'],
              signalScore: 2.1,
              publishedAt: DateTime.utc(2026, 7, 4, 18),
              citationIds: ['published-date-citation'],
            ),
          ],
        ),
        citations: [
          summaryCitationApiDto(
            id: 'published-date-citation',
            providerKey: 'reddit',
          ),
        ],
      ),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(
      const ValueKey('reader-summary-top-post-cluster:story:older-post'),
    );
    expect(
      find.descendant(
        of: rowFinder,
        matching: find.text('Older post should show its real date'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: rowFinder, matching: find.text('Jul 4, 2026')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: rowFinder, matching: find.text('Jul 6, 2026')),
      findsNothing,
    );
  });

  testWidgets('keeps the post provider avatar away from the row border', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );

    await tester.pumpWidget(_TestApp(summary: summary));
    await tester.pumpAndSettle();

    final rowFinder = find.byKey(
      const ValueKey('reader-summary-top-post-cluster:story:ai-coding-tools'),
    );
    final providerLogoFinder = find.descendant(
      of: rowFinder,
      matching: find.byType(AppProviderLogo),
    );

    expect(providerLogoFinder, findsOneWidget);
    final leftInset =
        tester.getTopLeft(providerLogoFinder).dx -
        tester.getTopLeft(rowFinder).dx;
    expect(leftInset, greaterThanOrEqualTo(AppSpacing.sm));
  });

  testWidgets('keeps backend editorial order for editorial sorting', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              storyClusterId: 'story:hn-low-engagement',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:hn-low-engagement',
              ),
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
              storyClusterId: 'story:reddit-strong-engagement',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:reddit-strong-engagement',
              ),
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
              storyClusterId: 'story:cross-source-workflow',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:cross-source-workflow',
              ),
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

    final firstRow = find.byKey(
      const ValueKey('reader-summary-top-post-cluster:story:hn-low-engagement'),
    );
    expect(
      find.descendant(
        of: firstRow,
        matching: find.text('HN single-source low-engagement debate'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(of: firstRow, matching: find.text('Single source')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: firstRow, matching: find.text('Low confidence')),
      findsNothing,
    );
    expect(find.text('Shares'), findsNothing);
    expect(find.text('Views'), findsNothing);
  });

  testWidgets('submits a star rating for a concrete top post', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    String? ratedTitle;
    int? submittedRating;
    PostRatingReason? submittedReason;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              storyClusterId: 'story:actionable-feedback',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:actionable-feedback',
              ),
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

    final rowFinder = find.byKey(
      const ValueKey(
        'reader-summary-top-post-cluster:story:actionable-feedback',
      ),
    );
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
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    int? submittedRating;
    PostRatingReason? submittedReason;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          topReads: [
            TopReadApiDto(
              storyClusterId: 'story:weak-evidence',
              cardKind: 'curated_top_read',
              promotionAttestation: topPromotionAttestationApiDto(
                'story:weak-evidence',
              ),
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

    final rowFinder = find.byKey(
      const ValueKey('reader-summary-top-post-cluster:story:weak-evidence'),
    );
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

  _registerTrustEvidenceTest();
}
