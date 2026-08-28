import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/reader_summary_topic_recommendation.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/reader_action_target.dart';
import '../view_models/reader_summary_top_posts_projection.dart';
import 'reader_summary_brief_surface.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_topic_recommendations_panel.dart';
import 'reader_summary_trust_panel.dart';

/// Executive summary board matching the summaries page reference design:
/// executive brief card with insight rail, and top posts.
class ReaderSummaryView extends StatelessWidget {
  const ReaderSummaryView({
    super.key,
    required this.summary,
    required this.isRefreshing,
    required this.readerActionState,
    this.topicRecommendationState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    this.topPostRatingFor,
    this.onTopPostRating,
    this.onTopicRecommendationDecision,
    required this.onOpenUrl,
    this.includeTopPosts = true,
  });

  factory ReaderSummaryView.readOnly({
    Key? key,
    required ReaderSummary summary,
    required bool isRefreshing,
    required ValueChanged<String> onOpenUrl,
    bool includeTopPosts = true,
  }) {
    return ReaderSummaryView(
      key: key,
      summary: summary,
      isRefreshing: isRefreshing,
      readerActionState: const InitialViewState<ReaderActionResult>(),
      activeReaderActionIdempotencyKey: null,
      lastReaderActionIdempotencyKey: null,
      onGenerate: _ignoreGenerate,
      intentForAction: _readOnlyIntent,
      onAction: _ignoreReaderAction,
      onOpenUrl: onOpenUrl,
      includeTopPosts: includeTopPosts,
    );
  }

  final ReaderSummary summary;
  final bool isRefreshing;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final AsyncViewState<ReaderSummaryTopicRecommendationQueue>?
  topicRecommendationState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;
  final int? Function(TopRead item)? topPostRatingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onTopPostRating;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )?
  onTopicRecommendationDecision;
  final ValueChanged<String> onOpenUrl;
  final bool includeTopPosts;

  @override
  Widget build(BuildContext context) {
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };
    final topPostsProjection = includeTopPosts
        ? readerSummaryTopPostsProjection(summary)
        : null;
    final selectedPostCount =
        summary.coverage?.selectedFeedItemCount ??
        (summary.content.selectedPosts.isNotEmpty
            ? summary.content.selectedPosts.length
            : summary.content.topReads.length);

    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (isRefreshing) ...[
            const _ReaderSummaryRefreshStatus(),
            const SizedBox(height: AppSpacing.sm),
          ],
          _ExecutiveBoardCard(
            summary: summary,
            citationsById: citationsById,
            readerActionState: readerActionState,
            intentForAction: intentForAction,
            onAction: onAction,
            onOpenUrl: onOpenUrl,
          ),
          if (topicRecommendationState case final state?)
            if (onTopicRecommendationDecision case final onDecision?)
              ReaderSummaryTopicRecommendationsPanel(
                state: state,
                onDecision: onDecision,
              ),
          if (summary.content.claimBoard.isNotEmpty ||
              summary.content.reliabilityReport.risks.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md + 2),
            ReaderSummaryTrustPanel(
              claims: summary.content.claimBoard,
              reliabilityReport: summary.content.reliabilityReport,
              citationsById: citationsById,
              onOpenUrl: onOpenUrl,
            ),
          ],
          if (topPostsProjection != null && !topPostsProjection.isEmpty) ...[
            const SizedBox(height: AppSpacing.md + 2),
            ReaderSummaryTopPosts(
              projection: topPostsProjection,
              selectedPostCount: selectedPostCount,
              period: summary.period,
              citationsById: citationsById,
              ratingFor: topPostRatingFor,
              onRated: onTopPostRating,
              onOpenUrl: onOpenUrl,
            ),
          ],
        ],
      ),
    );
  }
}

class _ReaderSummaryRefreshStatus extends StatelessWidget {
  const _ReaderSummaryRefreshStatus();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: 'Updating selected summary',
      child: const Align(
        alignment: Alignment.centerRight,
        child: AppStatusBadge(
          key: ValueKey('reader-summary-refreshing'),
          label: 'Refreshing',
        ),
      ),
    );
  }
}

void _ignoreGenerate() {}

UserActionIntent _readOnlyIntent(ReaderAction action) {
  return const UserActionIntent(id: 'reader-summary-read-only');
}

void _ignoreReaderAction(
  ReaderAction action, [
  ReaderFeedbackReason? feedbackReason,
]) {}

class _ExecutiveBoardCard extends StatelessWidget {
  const _ExecutiveBoardCard({
    required this.summary,
    required this.citationsById,
    required this.readerActionState,
    required this.intentForAction,
    required this.onAction,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final Map<String, SummaryCitation> citationsById;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        final wide = constraints.maxWidth >= 760;
        final hasCoverage = ReaderSummaryCoverageBySourceBand.hasCoverage(
          summary,
        );
        final brief = ReaderSummaryExecutiveBrief(
          summary: summary,
          citationsById: citationsById,
          onOpenUrl: onOpenUrl,
        );
        final rail = ReaderSummaryInsightRail(summary: summary);

        final Widget boardBody;
        if (wide) {
          boardBody = Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: brief),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
                child: SizedBox(
                  width: 1,
                  height: 360,
                  child: ColoredBox(color: colorScheme.outlineVariant),
                ),
              ),
              SizedBox(width: 300, child: rail),
            ],
          );
        } else {
          boardBody = Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              brief,
              const SizedBox(height: AppSpacing.lg),
              Divider(height: 1, color: colorScheme.outlineVariant),
              const SizedBox(height: AppSpacing.lg),
              rail,
            ],
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (hasCoverage) ...[
              ReaderSummaryCoverageBySourceBand(summary: summary),
              const SizedBox(height: AppSpacing.lg),
            ],
            boardBody,
          ],
        );
      },
    );
  }
}
