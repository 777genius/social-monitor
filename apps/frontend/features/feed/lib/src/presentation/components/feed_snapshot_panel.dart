import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/feed_item.dart';
import '../formatters/feed_time_formatters.dart';
import '../view_models/feed_provider_visuals.dart';
import 'feed_snapshot_metric_tile.dart';
import 'feed_snapshot_signal_section.dart';

class FeedSnapshotPanel extends StatelessWidget {
  const FeedSnapshotPanel({
    super.key,
    required this.items,
    required this.nextCursor,
    required this.topicLabel,
  });

  final List<FeedItem> items;
  final String? nextCursor;
  final String? topicLabel;

  @override
  Widget build(BuildContext context) {
    final latest = _latestItem(items);
    final providerCounts = _providerCounts(items);
    final topSignals = items.take(3).toList(growable: false);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(
          color: Theme.of(context).brightness == Brightness.dark
              ? AppColors.darkBorder
              : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: LayoutBuilder(
          builder: (context, constraints) {
            final compact = constraints.maxWidth < 760;
            final header = _SnapshotHeader(
              itemCount: items.length,
              topicLabel: topicLabel,
              hasMore: nextCursor != null,
            );
            final metrics = _SnapshotMetrics(
              itemCount: items.length,
              providerCount: providerCounts.length,
              latestLabel: latest == null
                  ? 'No posts'
                  : feedShortTimeLabel(latest.observedAt),
            );
            final mix = _ProviderMix(counts: providerCounts);
            final signals = _TopSignals(items: topSignals);

            if (compact) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  header,
                  const SizedBox(height: AppSpacing.md),
                  metrics,
                  const SizedBox(height: AppSpacing.md),
                  FeedCompactSignal(item: topSignals.firstOrNull),
                ],
              );
            }

            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                header,
                const SizedBox(height: AppSpacing.md),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(flex: 5, child: metrics),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(flex: 4, child: mix),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(flex: 6, child: signals),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _SnapshotHeader extends StatelessWidget {
  const _SnapshotHeader({
    required this.itemCount,
    required this.topicLabel,
    required this.hasMore,
  });

  final int itemCount;
  final String? topicLabel;
  final bool hasMore;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: const Padding(
            padding: EdgeInsets.all(AppSpacing.sm),
            child: Icon(
              Icons.summarize_outlined,
              color: AppColors.primary,
              size: 20,
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Today\'s briefing',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0,
                ),
              ),
              Text(
                topicLabel ?? 'All monitored sources',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        AppStatusBadge(
          label: hasMore ? '$itemCount loaded' : '$itemCount posts',
          tone: hasMore ? AppStatusTone.warning : AppStatusTone.success,
        ),
      ],
    );
  }
}

class _SnapshotMetrics extends StatelessWidget {
  const _SnapshotMetrics({
    required this.itemCount,
    required this.providerCount,
    required this.latestLabel,
  });

  final int itemCount;
  final int providerCount;
  final String latestLabel;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        FeedSnapshotMetricTile(label: 'Posts', value: '$itemCount'),
        FeedSnapshotMetricTile(label: 'Sources', value: '$providerCount'),
        FeedSnapshotMetricTile(label: 'Latest', value: latestLabel),
      ],
    );
  }
}

class _ProviderMix extends StatelessWidget {
  const _ProviderMix({required this.counts});

  final List<_ProviderCount> counts;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Source mix',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: counts.isEmpty
              ? const [AppStatusBadge(label: 'No sources')]
              : counts
                    .map(
                      (count) => AppStatusBadge(
                        label: '${count.visuals.label} ${count.count}',
                        tone: count.visuals.tone,
                      ),
                    )
                    .toList(growable: false),
        ),
      ],
    );
  }
}

class _TopSignals extends StatelessWidget {
  const _TopSignals({required this.items});

  final List<FeedItem> items;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return const AppInlineProblem(
        title: 'No briefing yet',
        message: 'No posts are loaded for this filter.',
        tone: AppProblemTone.neutral,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Signals',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final item in items) FeedSnapshotSignalRow(item: item),
      ],
    );
  }
}

FeedItem? _latestItem(List<FeedItem> items) {
  if (items.isEmpty) {
    return null;
  }
  return items.reduce((a, b) => a.observedAt.isAfter(b.observedAt) ? a : b);
}

List<_ProviderCount> _providerCounts(List<FeedItem> items) {
  final counts = <String, int>{};
  for (final item in items) {
    counts[item.providerKey] = (counts[item.providerKey] ?? 0) + 1;
  }
  final result = counts.entries
      .map(
        (entry) => _ProviderCount(
          visuals: feedProviderVisuals(entry.key),
          count: entry.value,
        ),
      )
      .toList();
  result.sort((a, b) => b.count.compareTo(a.count));
  return result;
}

final class _ProviderCount {
  const _ProviderCount({required this.visuals, required this.count});

  final FeedProviderVisuals visuals;
  final int count;
}
