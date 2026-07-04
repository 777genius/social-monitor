import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/reader_action_target.dart';
import 'reader_summary_brief_surface.dart';
import 'reader_summary_claim_board.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_reliability_indicators.dart';

/// Executive summary board matching the summaries page reference design:
/// executive brief card with insight rail, and top posts.
class ReaderSummaryView extends StatelessWidget {
  const ReaderSummaryView({
    super.key,
    required this.summary,
    required this.isRefreshing,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    required this.topPostRatingFor,
    required this.onTopPostRating,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final bool isRefreshing;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;
  final int? Function(TopRead item) topPostRatingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )
  onTopPostRating;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };
    final topPostItems = _topPostItems(summary);
    final selectedPostCount =
        summary.coverage?.selectedFeedItemCount ?? topPostItems.length;

    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _ExecutiveBoardCard(
            summary: summary,
            citationsById: citationsById,
            readerActionState: readerActionState,
            intentForAction: intentForAction,
            onAction: onAction,
            onOpenUrl: onOpenUrl,
          ),
          if (summary.content.claimBoard.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md + 2),
            ReaderSummaryClaimBoard(
              claims: summary.content.claimBoard,
              citationsById: citationsById,
              onOpenUrl: onOpenUrl,
            ),
          ],
          if (summary.content.reliabilityReport.risks.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md + 2),
            ReaderSummaryReliabilityIndicators(
              report: summary.content.reliabilityReport,
            ),
          ],
          if (topPostItems.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.md + 2),
            ReaderSummaryTopPosts(
              items: topPostItems,
              curatedTopPostCount: summary.content.topReads.length,
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

List<TopRead> _topPostItems(ReaderSummary summary) =>
    summary.content.selectedPosts.isNotEmpty
    ? summary.content.selectedPosts
    : summary.content.topReads;

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
        final brief = ReaderSummaryExecutiveBrief(
          summary: summary,
          citationsById: citationsById,
          onOpenUrl: onOpenUrl,
        );
        final rail = ReaderSummaryInsightRail(summary: summary);

        final Widget content;
        if (wide) {
          content = IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: brief),
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.lg,
                  ),
                  child: SizedBox(
                    width: 1,
                    child: ColoredBox(color: colorScheme.outlineVariant),
                  ),
                ),
                SizedBox(width: 300, child: rail),
              ],
            ),
          );
        } else {
          content = Column(
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
        return content;
      },
    );
  }
}
