import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/reader_summary_topic_recommendation.dart';
import 'reader_summary_topic_recommendation_rail.dart';

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
            showTitle: false,
            items: pending,
            onDecision: onDecision,
          ),
        if (accepted.isNotEmpty)
          _TopicRecommendationSection(
            title: 'Accepted history',
            showTitle: true,
            items: accepted,
            onDecision: onDecision,
          ),
        if (rejected.isNotEmpty)
          _TopicRecommendationSection(
            title: 'Rejected history',
            showTitle: true,
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
    required this.showTitle,
    required this.items,
    required this.onDecision,
  });

  final String title;
  final bool showTitle;
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
          if (showTitle) ...[
            Text(
              title,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
          ReaderSummaryTopicRecommendationRail(
            items: items,
            onDecision: onDecision,
          ),
        ],
      ),
    );
  }
}
