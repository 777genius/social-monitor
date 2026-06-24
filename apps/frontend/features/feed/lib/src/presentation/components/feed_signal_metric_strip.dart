import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/feed_provider_metrics.dart';
import '../../domain/value_objects/feed_signal_snapshot.dart';

class FeedSignalMetricStrip extends StatelessWidget {
  const FeedSignalMetricStrip({
    super.key,
    required this.signal,
    required this.metrics,
    this.dense = false,
  });

  final FeedSignalSnapshot? signal;
  final FeedProviderMetrics? metrics;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final chips = [
      if (signal != null)
        _MetricChip(
          icon: Icons.signal_cellular_alt,
          label: 'Signal ${signal!.score}',
          emphasis: _bandLabel(signal!.band),
        ),
      ..._metricChips(metrics).take(dense ? 4 : 6),
    ];

    if (chips.isEmpty) {
      return const SizedBox.shrink();
    }

    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      children: chips,
    );
  }
}

List<Widget> _metricChips(FeedProviderMetrics? metrics) {
  return switch (metrics) {
    RedditPostMetrics() => [
      _MetricChip(icon: Icons.arrow_upward, label: '${metrics.score} score'),
      _MetricChip(
        icon: Icons.forum_outlined,
        label: '${metrics.comments} comments',
      ),
      if (metrics.upvoteRatio != null)
        _MetricChip(
          icon: Icons.thumb_up_alt_outlined,
          label: '${(metrics.upvoteRatio! * 100).round()}% upvotes',
        ),
    ],
    GitHubRepositoryMetrics() => [
      _MetricChip(
        icon: Icons.star_outline,
        label: '${_compactNumber(metrics.stars)} stars',
      ),
      _MetricChip(
        icon: Icons.call_split,
        label: '${_compactNumber(metrics.forks)} forks',
      ),
      ...metrics.trendDeltas
          .take(3)
          .map(
            (delta) => _MetricChip(
              icon: Icons.trending_up,
              label: '+${_compactNumber(delta.value)} / ${delta.window}',
            ),
          ),
    ],
    HackerNewsStoryMetrics() => [
      _MetricChip(icon: Icons.north, label: '${metrics.points} points'),
      _MetricChip(
        icon: Icons.mode_comment_outlined,
        label: '${metrics.comments} comments',
      ),
    ],
    XPostMetrics() => [
      _MetricChip(
        icon: Icons.favorite_border,
        label: '${_compactNumber(metrics.likes)} likes',
      ),
      _MetricChip(
        icon: Icons.repeat,
        label: '${_compactNumber(metrics.reposts)} reposts',
      ),
      _MetricChip(
        icon: Icons.mode_comment_outlined,
        label: '${_compactNumber(metrics.replies)} replies',
      ),
      _MetricChip(
        icon: Icons.format_quote,
        label: '${_compactNumber(metrics.quotes)} quotes',
      ),
      _MetricChip(
        icon: Icons.bookmark_border,
        label: '${_compactNumber(metrics.bookmarks)} bookmarks',
      ),
      _MetricChip(
        icon: Icons.visibility_outlined,
        label: '${_compactNumber(metrics.impressions)} impressions',
      ),
    ],
    null => const [],
  };
}

String _bandLabel(FeedSignalBand band) {
  return switch (band) {
    FeedSignalBand.breakout => 'Breakout',
    FeedSignalBand.high => 'High',
    FeedSignalBand.normal => 'Normal',
    FeedSignalBand.low => 'Low',
    FeedSignalBand.noSignal => 'No signal',
    FeedSignalBand.unknown => 'Unknown',
  };
}

String _compactNumber(int value) {
  if (value >= 1000000) {
    return '${(value / 1000000).toStringAsFixed(1)}M';
  }
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}k';
  }
  return value.toString();
}

class _MetricChip extends StatelessWidget {
  const _MetricChip({required this.icon, required this.label, this.emphasis});

  final IconData icon;
  final String label;
  final String? emphasis;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 180),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 14,
                color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
              ),
              const SizedBox(width: AppSpacing.xs),
              Flexible(
                child: Text(
                  emphasis == null ? label : '$label - $emphasis',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: dark ? AppColors.darkTextMuted : AppColors.textMuted,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
