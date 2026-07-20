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
              color: metric.emphasized
                  ? colorScheme.primary
                  : colorScheme.onSurfaceVariant,
            ),
            const SizedBox(width: AppSpacing.xs),
            Text(
              metric.value,
              style: textTheme.bodySmall?.copyWith(
                color: metric.emphasized ? colorScheme.primary : null,
                fontWeight: metric.emphasized
                    ? FontWeight.w900
                    : FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          metric.label,
          style: textTheme.labelSmall?.copyWith(
            color: metric.emphasized
                ? colorScheme.primary
                : colorScheme.onSurfaceVariant,
            fontWeight: metric.emphasized ? FontWeight.w800 : FontWeight.w600,
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
  const _TopPostRelevanceColumn({
    required this.item,
    required this.supportSignal,
  });

  final TopRead item;
  final _TopPostSupportSignal supportSignal;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final badge = _topPostSupportStyle(context, supportSignal);
    final interestCount = item.matchedInterestIds.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Tooltip(
          message: badge.tooltip,
          child: DecoratedBox(
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
  String tooltip,
  Color background,
  Color foreground,
  IconData icon,
});

/// Resolves the cross-source/same-source/single-source relevance badge shared
/// by the detailed relevance column and the compact dense row chip.
_TopPostRelevanceBadge _topPostSupportStyle(
  BuildContext context,
  _TopPostSupportSignal supportSignal,
) {
  final colorScheme = Theme.of(context).colorScheme;
  return switch (supportSignal.kind) {
    _TopPostSupportKind.crossSource => (
      label: 'Cross-source',
      tooltip:
          'Same story confirmed by different source families, for example Reddit + RSS, HN + RSS, or X + Reddit. Stronger signal: less likely to be one-platform noise.',
      background: AppColors.successSurface,
      foreground: AppColors.success,
      icon: Icons.hub_outlined,
    ),
    _TopPostSupportKind.sameSource => (
      label: 'Same-source support',
      tooltip:
          'Related posts exist inside one source family, for example several Reddit posts or several X posts. Useful trend signal, but weaker because one platform can echo itself.',
      background: colorScheme.primary.withValues(alpha: 0.12),
      foreground: colorScheme.primary,
      icon: Icons.check_circle_outline_rounded,
    ),
    _TopPostSupportKind.singleSource => (
      label: 'Single source',
      tooltip:
          'Only one monitored source item supports this story so far. Treat it as a lead until another source confirms it.',
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
