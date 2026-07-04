part of 'reader_summary_brief_surface.dart';

class _TopPostMetricsRow extends StatelessWidget {
  const _TopPostMetricsRow({required this.metrics});

  final List<TopPostMetric> metrics;

  @override
  Widget build(BuildContext context) {
    if (metrics.isEmpty) {
      return const SizedBox.shrink();
    }
    return Wrap(
      spacing: AppSpacing.md,
      runSpacing: AppSpacing.sm,
      children: [
        for (final metric in metrics) _TopPostMetricTile(metric: metric),
      ],
    );
  }
}

class _TopPostMetricTile extends StatelessWidget {
  const _TopPostMetricTile({required this.metric});

  final TopPostMetric metric;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _topPostMetricIcon(metric.label),
              size: 14,
              color: colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: AppSpacing.xs),
            Text(
              metric.value,
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          metric.label,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

IconData _topPostMetricIcon(String label) {
  return switch (label.toLowerCase()) {
    'likes' => Icons.favorite_border_rounded,
    'reposts' => Icons.repeat_rounded,
    'replies' => Icons.mode_comment_outlined,
    'views' => Icons.visibility_outlined,
    'upvotes' => Icons.arrow_circle_up_outlined,
    'points' => Icons.arrow_circle_up_outlined,
    'comments' => Icons.mode_comment_outlined,
    'shares' => Icons.ios_share_rounded,
    'stars' || 'stars today' => Icons.star_border_rounded,
    'rank' => Icons.trending_up_rounded,
    'forks' => Icons.fork_right_rounded,
    'reactions' => Icons.add_reaction_outlined,
    _ => Icons.insights_outlined,
  };
}

class _TopPostRelevanceColumn extends StatelessWidget {
  const _TopPostRelevanceColumn({required this.item});

  final TopRead item;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final badge = _topPostRelevanceBadge(context, item);
    final interestCount = item.matchedInterestIds.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: badge.background,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm + 2,
              vertical: AppSpacing.xs + 1,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(badge.icon, size: 13, color: badge.foreground),
                const SizedBox(width: AppSpacing.xs),
                Flexible(
                  child: Text(
                    badge.label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.labelSmall?.copyWith(
                      color: badge.foreground,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (interestCount > 0) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Matching $interestCount '
            '${interestCount == 1 ? 'interest' : 'interests'}',
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Signal ${item.signalScore.value.toStringAsFixed(2)}',
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

typedef _TopPostRelevanceBadge = ({
  String label,
  Color background,
  Color foreground,
  IconData icon,
});

/// Resolves the cross-source/same-source/single-source relevance badge shared
/// by the detailed relevance column and the compact dense row chip.
_TopPostRelevanceBadge _topPostRelevanceBadge(
  BuildContext context,
  TopRead item,
) {
  final colorScheme = Theme.of(context).colorScheme;
  if (_topPostConfirmedProviderCount(item) > 1) {
    return (
      label: 'Cross-source',
      background: AppColors.successSurface,
      foreground: AppColors.success,
      icon: Icons.hub_outlined,
    );
  }
  return switch (item.confidence.level.trim().toLowerCase()) {
    'high' || 'medium' => (
      label: 'Same-source support',
      background: AppColors.warningSurface,
      foreground: AppColors.amber,
      icon: Icons.check_circle_outline_rounded,
    ),
    _ => (
      label: 'Single source',
      background: colorScheme.surfaceContainerHighest.withValues(alpha: 0.6),
      foreground: colorScheme.onSurfaceVariant,
      icon: Icons.radio_button_unchecked_rounded,
    ),
  };
}

int _topPostConfirmedProviderCount(TopRead item) {
  final keys = {
    for (final key in item.confirmedProviderKeys)
      if (key.trim().isNotEmpty) key.trim().toLowerCase(),
  };

  return keys.isEmpty ? 1 : keys.length;
}

class _TopPostMenu extends StatelessWidget {
  const _TopPostMenu({required this.item, required this.onOpenUrl});

  final TopRead item;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = item.canonicalUrl;
    final colorScheme = Theme.of(context).colorScheme;
    return PopupMenuButton<String>(
      tooltip: 'Post actions',
      position: PopupMenuPosition.under,
      icon: Icon(
        Icons.more_vert_rounded,
        size: 18,
        color: colorScheme.onSurfaceVariant,
      ),
      onSelected: (action) => _handle(context, action),
      itemBuilder: (context) => [
        PopupMenuItem<String>(
          value: 'open',
          enabled: url != null,
          child: const Text('Open post'),
        ),
        PopupMenuItem<String>(
          value: 'copy',
          enabled: url != null,
          child: const Text('Copy link'),
        ),
      ],
    );
  }

  Future<void> _handle(BuildContext context, String action) async {
    final url = item.canonicalUrl;
    if (url == null) {
      return;
    }
    if (action == 'open') {
      onOpenUrl(url);
      return;
    }
    final messenger = ScaffoldMessenger.maybeOf(context);
    await Clipboard.setData(ClipboardData(text: url));
    messenger?.showSnackBar(
      const SnackBar(content: Text('Post link copied to clipboard')),
    );
  }
}
