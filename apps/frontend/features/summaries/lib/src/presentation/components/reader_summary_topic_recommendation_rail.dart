import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';

typedef ReaderSummaryTopicRecommendationDecisionCallback =
    Future<void> Function(
      ReaderSummaryTopicRecommendation recommendation,
      ReaderSummaryTopicRecommendationDecisionStatus status,
    );

class ReaderSummaryTopicRecommendationRail extends StatefulWidget {
  const ReaderSummaryTopicRecommendationRail({
    super.key,
    required this.items,
    required this.onDecision,
  });

  final List<ReaderSummaryTopicRecommendation> items;
  final ReaderSummaryTopicRecommendationDecisionCallback onDecision;

  @override
  State<ReaderSummaryTopicRecommendationRail> createState() =>
      _ReaderSummaryTopicRecommendationRailState();
}

class _ReaderSummaryTopicRecommendationRailState
    extends State<ReaderSummaryTopicRecommendationRail> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final cardWidth = maxWidth.isFinite
            ? maxWidth.clamp(280.0, 340.0).toDouble()
            : 340.0;
        final contentWidth =
            widget.items.length * cardWidth +
            (widget.items.length - 1) * AppSpacing.sm;
        final shouldShowScrollbar =
            maxWidth.isFinite && contentWidth > maxWidth;

        return Scrollbar(
          controller: _scrollController,
          thumbVisibility: shouldShowScrollbar,
          child: SingleChildScrollView(
            controller: _scrollController,
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var index = 0; index < widget.items.length; index++) ...[
                  SizedBox(
                    width: cardWidth,
                    child: _TopicRecommendationTile(
                      recommendation: widget.items[index],
                      onDecision: widget.onDecision,
                    ),
                  ),
                  if (index < widget.items.length - 1)
                    const SizedBox(width: AppSpacing.sm),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _TopicRecommendationTile extends StatelessWidget {
  const _TopicRecommendationTile({
    required this.recommendation,
    required this.onDecision,
  });

  final ReaderSummaryTopicRecommendation recommendation;
  final ReaderSummaryTopicRecommendationDecisionCallback onDecision;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final promotes = recommendation.promotesToCore;
    final borderColor = promotes
        ? AppColors.teal.withValues(alpha: 0.36)
        : colorScheme.outlineVariant;
    final background = promotes
        ? AppColors.teal.withValues(alpha: 0.08)
        : colorScheme.surfaceContainerHighest.withValues(alpha: 0.28);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        border: Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs + 2,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(child: _TopicSummary(recommendation: recommendation)),
            const SizedBox(width: AppSpacing.sm),
            _RecommendationActions(
              recommendation: recommendation,
              onDecision: onDecision,
            ),
          ],
        ),
      ),
    );
  }
}

class _TopicSummary extends StatelessWidget {
  const _TopicSummary({required this.recommendation});

  final ReaderSummaryTopicRecommendation recommendation;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final metrics = recommendation.metrics;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Tooltip(
          message: recommendation.topicLabel,
          child: Text(
            recommendation.topicLabel,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              height: 1.12,
              letterSpacing: 0,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          _metaLine(recommendation, metrics),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

class _RecommendationActions extends StatelessWidget {
  const _RecommendationActions({
    required this.recommendation,
    required this.onDecision,
  });

  final ReaderSummaryTopicRecommendation recommendation;
  final ReaderSummaryTopicRecommendationDecisionCallback onDecision;

  @override
  Widget build(BuildContext context) {
    if (recommendation.decisionStatus ==
        ReaderSummaryTopicRecommendationDecisionStatus.pending) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _DecisionIconButton(
            tooltip: 'Add topic query: ${recommendation.topicLabel}',
            icon: Icons.thumb_up_alt_outlined,
            tone: _DecisionIconButtonTone.accept,
            onPressed: () => onDecision(
              recommendation,
              ReaderSummaryTopicRecommendationDecisionStatus.accepted,
            ),
          ),
          const SizedBox(width: 4),
          _DecisionIconButton(
            tooltip: 'Reject topic query: ${recommendation.topicLabel}',
            icon: Icons.thumb_down_alt_outlined,
            tone: _DecisionIconButtonTone.reject,
            onPressed: () => onDecision(
              recommendation,
              ReaderSummaryTopicRecommendationDecisionStatus.rejected,
            ),
          ),
        ],
      );
    }

    return _DecisionIconButton(
      tooltip: 'Undo topic decision',
      icon: Icons.undo_rounded,
      tone: _DecisionIconButtonTone.neutral,
      onPressed: () => onDecision(
        recommendation,
        ReaderSummaryTopicRecommendationDecisionStatus.pending,
      ),
    );
  }
}

enum _DecisionIconButtonTone { accept, reject, neutral }

class _DecisionIconButton extends StatelessWidget {
  const _DecisionIconButton({
    required this.tooltip,
    required this.icon,
    required this.tone,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final _DecisionIconButtonTone tone;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final foreground = switch (tone) {
      _DecisionIconButtonTone.accept => AppColors.success,
      _DecisionIconButtonTone.reject => colorScheme.error,
      _DecisionIconButtonTone.neutral => colorScheme.onSurfaceVariant,
    };

    return IconButton.filledTonal(
      tooltip: tooltip,
      style: IconButton.styleFrom(
        fixedSize: const Size.square(32),
        minimumSize: const Size.square(32),
        padding: EdgeInsets.zero,
        backgroundColor: foreground.withValues(alpha: 0.12),
        foregroundColor: foreground,
        hoverColor: foreground.withValues(alpha: 0.16),
        focusColor: foreground.withValues(alpha: 0.18),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: BorderSide(color: foreground.withValues(alpha: 0.22)),
        ),
      ),
      icon: Icon(icon, size: 17),
      onPressed: onPressed,
    );
  }
}

String _metaLine(
  ReaderSummaryTopicRecommendation recommendation,
  ReaderSummaryTopicRecommendationMetrics metrics,
) {
  final status = switch (recommendation.decisionStatus) {
    ReaderSummaryTopicRecommendationDecisionStatus.accepted => 'Accepted',
    ReaderSummaryTopicRecommendationDecisionStatus.rejected => 'Rejected',
    _ => recommendation.promotesToCore ? 'Promote' : null,
  };
  final confidence = '${(recommendation.confidenceScore * 100).round()}%';
  final citationsLabel = metrics.citationCount == 1 ? 'cite' : 'cites';

  return [
    ?status,
    confidence,
    '${metrics.selectedEvidenceCount} evidence',
    '${metrics.topReadCount} reads',
    '${metrics.citationCount} $citationsLabel',
  ].join(' · ');
}
