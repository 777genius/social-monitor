import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';
import 'reader_summary_topic_decision_icon_button.dart';
import 'reader_summary_topic_rail_scroll_button.dart';

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
  bool _canScrollBackward = false;
  bool _canScrollForward = false;
  bool _syncScheduled = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_syncArrowState);
  }

  @override
  void didUpdateWidget(ReaderSummaryTopicRecommendationRail oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.items.length != widget.items.length) {
      _scheduleArrowSync();
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_syncArrowState);
    _scrollController.dispose();
    super.dispose();
  }

  void _scheduleArrowSync() {
    if (_syncScheduled) {
      return;
    }

    _syncScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _syncScheduled = false;
      if (!mounted) {
        return;
      }
      _syncArrowState();
    });
  }

  void _syncArrowState() {
    if (!_scrollController.hasClients ||
        !_scrollController.position.hasContentDimensions) {
      _setArrowState(backward: false, forward: false);
      return;
    }

    const tolerance = 1.0;
    final position = _scrollController.position;
    _setArrowState(
      backward: position.pixels > position.minScrollExtent + tolerance,
      forward: position.pixels < position.maxScrollExtent - tolerance,
    );
  }

  void _setArrowState({required bool backward, required bool forward}) {
    if (_canScrollBackward == backward && _canScrollForward == forward) {
      return;
    }

    setState(() {
      _canScrollBackward = backward;
      _canScrollForward = forward;
    });
  }

  Future<void> _scrollBy(double distance) async {
    if (!_scrollController.hasClients) {
      return;
    }

    final position = _scrollController.position;
    final target = (position.pixels + distance)
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();

    await _scrollController.animateTo(
      target,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
    if (!mounted) {
      return;
    }
    _syncArrowState();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final maxWidth = constraints.maxWidth;
        final cardWidth = maxWidth.isFinite
            ? maxWidth.clamp(280.0, 340.0).toDouble()
            : 340.0;
        final gapCount = widget.items.length > 1 ? widget.items.length - 1 : 0;
        final contentWidth =
            widget.items.length * cardWidth + gapCount * AppSpacing.sm;
        final shouldShowScrollbar =
            maxWidth.isFinite && contentWidth > maxWidth;
        final scrollDistance = cardWidth + AppSpacing.sm;
        final showBackwardArrow = shouldShowScrollbar && _canScrollBackward;
        final showForwardArrow =
            shouldShowScrollbar &&
            (_canScrollForward || !_scrollController.hasClients);

        _scheduleArrowSync();

        return Stack(
          children: [
            Scrollbar(
              controller: _scrollController,
              thumbVisibility: shouldShowScrollbar,
              child: SingleChildScrollView(
                controller: _scrollController,
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    for (
                      var index = 0;
                      index < widget.items.length;
                      index++
                    ) ...[
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
            ),
            if (showBackwardArrow)
              Positioned(
                left: 0,
                top: 0,
                bottom: AppSpacing.xs,
                child: Center(
                  child: ReaderSummaryTopicRailScrollButton(
                    tooltip: 'Show previous topic recommendation',
                    icon: Icons.chevron_left_rounded,
                    onPressed: () => _scrollBy(-scrollDistance),
                  ),
                ),
              ),
            if (showForwardArrow)
              Positioned(
                right: 0,
                top: 0,
                bottom: AppSpacing.xs,
                child: Center(
                  child: ReaderSummaryTopicRailScrollButton(
                    tooltip: 'Show next topic recommendation',
                    icon: Icons.chevron_right_rounded,
                    onPressed: () => _scrollBy(scrollDistance),
                  ),
                ),
              ),
          ],
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
          ReaderSummaryTopicDecisionIconButton(
            tooltip: 'Add topic query: ${recommendation.topicLabel}',
            icon: Icons.thumb_up_alt_outlined,
            tone: ReaderSummaryTopicDecisionIconButtonTone.accept,
            onPressed: () => onDecision(
              recommendation,
              ReaderSummaryTopicRecommendationDecisionStatus.accepted,
            ),
          ),
          const SizedBox(width: 4),
          ReaderSummaryTopicDecisionIconButton(
            tooltip: 'Reject topic query: ${recommendation.topicLabel}',
            icon: Icons.thumb_down_alt_outlined,
            tone: ReaderSummaryTopicDecisionIconButtonTone.reject,
            onPressed: () => onDecision(
              recommendation,
              ReaderSummaryTopicRecommendationDecisionStatus.rejected,
            ),
          ),
        ],
      );
    }

    return ReaderSummaryTopicDecisionIconButton(
      tooltip: 'Undo topic decision',
      icon: Icons.undo_rounded,
      tone: ReaderSummaryTopicDecisionIconButtonTone.neutral,
      onPressed: () => onDecision(
        recommendation,
        ReaderSummaryTopicRecommendationDecisionStatus.pending,
      ),
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
