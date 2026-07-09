import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_topic_recommendation.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_topic_recommendations_panel.dart';

void main() {
  testWidgets('renders pending topic recommendations as approval cards', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(620, 480);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final decisions = <ReaderSummaryTopicRecommendationDecisionStatus>[];

    await tester.pumpWidget(
      _TestApp(
        recommendations: [
          recommendation('Open source repos'),
          recommendation('Anthropic workshop'),
        ],
        onDecision: (_, status) async => decisions.add(status),
      ),
    );

    expect(find.text('Topic recommendations'), findsOneWidget);
    expect(find.text('Pending'), findsNothing);
    expect(find.text('Pending (2)'), findsNothing);
    expect(find.textContaining('Keep observing'), findsNothing);
    expect(find.text('Topic to apply'), findsNothing);
    expect(find.text('Evidence'), findsNothing);
    expect(find.text('Open source repos'), findsOneWidget);
    expect(find.byType(Scrollbar), findsOneWidget);
    expect(find.byTooltip('Show previous topic recommendation'), findsNothing);
    expect(find.byTooltip('Show next topic recommendation'), findsOneWidget);
    expect(find.byIcon(Icons.thumb_up_alt_outlined), findsNWidgets(2));
    expect(find.byIcon(Icons.thumb_down_alt_outlined), findsNWidgets(2));

    await tester.tap(find.byTooltip('Add topic query: Open source repos'));
    await tester.pump();

    expect(decisions, [
      ReaderSummaryTopicRecommendationDecisionStatus.accepted,
    ]);
  });

  testWidgets('shows rail arrows only when another recommendation is hidden', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(620, 480);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      _TestApp(
        recommendations: [
          recommendation('Open source repos'),
          recommendation('Anthropic workshop'),
        ],
        onDecision: (_, _) async {},
      ),
    );
    await tester.pump();

    expect(find.byTooltip('Show previous topic recommendation'), findsNothing);
    expect(find.byTooltip('Show next topic recommendation'), findsOneWidget);

    await tester.tap(find.byTooltip('Show next topic recommendation'));
    await tester.pumpAndSettle();

    expect(
      find.byTooltip('Show previous topic recommendation'),
      findsOneWidget,
    );
    expect(find.byTooltip('Show next topic recommendation'), findsNothing);
  });
}

class _TestApp extends StatelessWidget {
  const _TestApp({required this.recommendations, required this.onDecision});

  final List<ReaderSummaryTopicRecommendation> recommendations;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )
  onDecision;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();

    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SizedBox(
            width: 620,
            child: ReaderSummaryTopicRecommendationsPanel(
              state: ReadyViewState<ReaderSummaryTopicRecommendationQueue>(
                ReaderSummaryTopicRecommendationQueue(
                  windowStartedAt: DateTime.utc(2026, 7, 1),
                  windowEndedAt: DateTime.utc(2026, 7, 5),
                  items: recommendations,
                ),
              ),
              onDecision: onDecision,
            ),
          ),
        ),
      ),
    );
  }
}

ReaderSummaryTopicRecommendation recommendation(
  String topicLabel,
) => ReaderSummaryTopicRecommendation(
  id: 'topic-rec:14:${topicLabel.toLowerCase()}',
  kind: ReaderSummaryTopicRecommendationKind.observeAdjacentTopic,
  decisionStatus: ReaderSummaryTopicRecommendationDecisionStatus.pending,
  topicLabel: topicLabel,
  currentTier: ReaderSummaryTopicTier.adjacent,
  suggestedTier: ReaderSummaryTopicTier.adjacent,
  confidenceScore: 0.57,
  rationale:
      'Keep observing: the topic has signal, but needs more repeated or cross-source evidence before promotion.',
  windowDays: 14,
  metrics: const ReaderSummaryTopicRecommendationMetrics(
    collectedPostCount: 24,
    summaryCount: 4,
    selectedEvidenceCount: 4,
    topReadCount: 4,
    citationCount: 1,
    crossSourceSummaryCount: 2,
    usefulSummaryCount: 4,
    duplicateEvidenceCount: 0,
    lowRelevanceSignalCount: 0,
    mutedSignalCount: 0,
    userRatedSignalCount: 0,
    selectionRate: 0.16,
    citationRate: 0.25,
    topReadRate: 1,
    duplicateRate: 0,
    noiseRate: 0.84,
    averageSignalScore: 2.02,
  ),
  providerKeys: const ['reddit', 'rss'],
  interestIds: const ['interest-ai'],
  evidenceReaderSummaryIds: const ['summary-1'],
  reasons: const ['4 selected evidence items', '4 top reads', '1 citations'],
);
