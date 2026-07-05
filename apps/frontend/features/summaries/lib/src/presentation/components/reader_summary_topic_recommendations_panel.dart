import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';

class ReaderSummaryTopicRecommendationsPanel extends StatelessWidget {
  const ReaderSummaryTopicRecommendationsPanel({
    super.key,
    required this.state,
    required this.onDecision,
  });

  final AsyncViewState<ReaderSummaryTopicRecommendationQueue> state;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )
  onDecision;

  @override
  Widget build(BuildContext context) {
    final queue = switch (state) {
      ReadyViewState<ReaderSummaryTopicRecommendationQueue>(:final value) =>
        value,
      LoadingViewState<ReaderSummaryTopicRecommendationQueue>(
        :final previousValue,
      ) =>
        previousValue,
      _ => null,
    };
    if (queue == null || queue.items.isEmpty) {
      return const SizedBox.shrink();
    }

    final isRefreshing =
        state is LoadingViewState<ReaderSummaryTopicRecommendationQueue>;
    final pending = queue.items
        .where(
          (item) =>
              item.decisionStatus ==
              ReaderSummaryTopicRecommendationDecisionStatus.pending,
        )
        .toList(growable: false);
    final accepted = queue.items
        .where(
          (item) =>
              item.decisionStatus ==
              ReaderSummaryTopicRecommendationDecisionStatus.accepted,
        )
        .toList(growable: false);
    final rejected = queue.items
        .where(
          (item) =>
              item.decisionStatus ==
              ReaderSummaryTopicRecommendationDecisionStatus.rejected,
        )
        .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: AppSpacing.md + 2),
        Row(
          children: [
            Expanded(
              child: Text(
                'Topic recommendations',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
            if (isRefreshing)
              const AppStatusBadge(
                label: 'Refreshing',
                tone: AppStatusTone.neutral,
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        if (pending.isNotEmpty)
          _TopicRecommendationSection(
            title: 'Pending',
            items: pending,
            onDecision: onDecision,
          ),
        if (accepted.isNotEmpty)
          _TopicRecommendationSection(
            title: 'Accepted history',
            items: accepted,
            onDecision: onDecision,
          ),
        if (rejected.isNotEmpty)
          _TopicRecommendationSection(
            title: 'Rejected history',
            items: rejected,
            onDecision: onDecision,
          ),
      ],
    );
  }
}

class _TopicRecommendationSection extends StatelessWidget {
  const _TopicRecommendationSection({
    required this.title,
    required this.items,
    required this.onDecision,
  });

  final String title;
  final List<ReaderSummaryTopicRecommendation> items;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )
  onDecision;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$title (${items.length})',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final item in items)
                _TopicRecommendationPill(
                  recommendation: item,
                  onDecision: onDecision,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TopicRecommendationPill extends StatelessWidget {
  const _TopicRecommendationPill({
    required this.recommendation,
    required this.onDecision,
  });

  final ReaderSummaryTopicRecommendation recommendation;
  final Future<void> Function(
    ReaderSummaryTopicRecommendation recommendation,
    ReaderSummaryTopicRecommendationDecisionStatus status,
  )
  onDecision;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final promotes = recommendation.promotesToCore;
    final borderColor = promotes
        ? AppColors.teal.withValues(alpha: 0.36)
        : colorScheme.outlineVariant;
    final background = promotes
        ? AppColors.teal.withValues(alpha: 0.08)
        : colorScheme.surfaceContainerHighest.withValues(alpha: 0.48);

    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 360),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: background,
          border: Border.all(color: borderColor),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    recommendation.topicLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                  AppStatusBadge(
                    label: _decisionLabel(recommendation),
                    tone: _decisionTone(recommendation),
                  ),
                  AppStatusBadge(
                    label: '${(recommendation.confidenceScore * 100).round()}%',
                    tone: AppStatusTone.neutral,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                recommendation.rationale,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  height: 1.25,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: [
                  _MetricText(
                    label:
                        '${recommendation.metrics.collectedPostCount} collected',
                  ),
                  _MetricText(
                    label: '${recommendation.metrics.summaryCount} summaries',
                  ),
                  _MetricText(
                    label:
                        '${recommendation.metrics.selectedEvidenceCount} selected',
                  ),
                  if (recommendation.metrics.crossSourceSummaryCount > 0)
                    _MetricText(
                      label:
                          '${recommendation.metrics.crossSourceSummaryCount} cross-source',
                    ),
                  if (recommendation.metrics.averageSignalScore > 0)
                    _MetricText(
                      label:
                          'signal ${recommendation.metrics.averageSignalScore.toStringAsFixed(2)}',
                    ),
                  if (recommendation.metrics.selectionRate > 0)
                    _MetricText(
                      label:
                          'selected ${(recommendation.metrics.selectionRate * 100).round()}%',
                    ),
                  if (recommendation.metrics.lowRelevanceSignalCount > 0)
                    _MetricText(
                      label:
                          '${recommendation.metrics.lowRelevanceSignalCount} low relevance',
                    ),
                  if (recommendation.metrics.noiseRate > 0)
                    _MetricText(
                      label:
                          'noise ${(recommendation.metrics.noiseRate * 100).round()}%',
                    ),
                ],
              ),
              if (recommendation.reasons.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Why suggested',
                  style: textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    for (final reason in recommendation.reasons.take(3))
                      AppStatusBadge(
                        label: reason,
                        tone: AppStatusTone.neutral,
                      ),
                  ],
                ),
              ],
              if (recommendation.decisionStatus ==
                  ReaderSummaryTopicRecommendationDecisionStatus.pending) ...[
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  children: [
                    TextButton(
                      onPressed: () => onDecision(
                        recommendation,
                        ReaderSummaryTopicRecommendationDecisionStatus.accepted,
                      ),
                      child: const Text('Accept'),
                    ),
                    TextButton(
                      onPressed: () => onDecision(
                        recommendation,
                        ReaderSummaryTopicRecommendationDecisionStatus.rejected,
                      ),
                      child: const Text('Reject'),
                    ),
                  ],
                ),
              ] else ...[
                const SizedBox(height: AppSpacing.sm),
                TextButton(
                  onPressed: () => onDecision(
                    recommendation,
                    ReaderSummaryTopicRecommendationDecisionStatus.pending,
                  ),
                  child: const Text('Undo'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

String _decisionLabel(ReaderSummaryTopicRecommendation recommendation) {
  return switch (recommendation.decisionStatus) {
    ReaderSummaryTopicRecommendationDecisionStatus.accepted => 'Accepted',
    ReaderSummaryTopicRecommendationDecisionStatus.rejected => 'Rejected',
    _ => recommendation.promotesToCore ? 'Promote to core' : 'Observe',
  };
}

AppStatusTone _decisionTone(ReaderSummaryTopicRecommendation recommendation) {
  return switch (recommendation.decisionStatus) {
    ReaderSummaryTopicRecommendationDecisionStatus.accepted =>
      AppStatusTone.success,
    ReaderSummaryTopicRecommendationDecisionStatus.rejected =>
      AppStatusTone.neutral,
    _ =>
      recommendation.promotesToCore
          ? AppStatusTone.success
          : AppStatusTone.neutral,
  };
}

class _MetricText extends StatelessWidget {
  const _MetricText({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: Theme.of(context).textTheme.labelSmall?.copyWith(
        color: Theme.of(context).colorScheme.onSurfaceVariant,
        fontWeight: FontWeight.w700,
        letterSpacing: 0,
      ),
    );
  }
}
