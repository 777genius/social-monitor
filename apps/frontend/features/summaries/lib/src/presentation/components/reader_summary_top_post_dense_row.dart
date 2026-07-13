part of 'reader_summary_brief_surface.dart';

/// Single-line compact layout for a top post.
///
/// Everything sits on one row: provider mark, title, an optional primary
/// metric, a relevance chip, the inline rating slot and the actions menu.
/// Secondary details (metric label, chip) drop out on narrower widths so the
/// row never wraps.
Widget _denseTopPostRow(
  BuildContext context,
  TopRead item,
  List<TopPostMetric> metrics,
  double width,
  Widget rating,
  Widget menu,
  _TopPostSupportSignal supportSignal,
) {
  final textTheme = Theme.of(context).textTheme;
  final showMetric = width >= 680 && metrics.isNotEmpty;
  final showChip = width >= 520;
  final primaryMetric = metrics.isEmpty
      ? null
      : metrics.firstWhere(
          (metric) => metric.emphasized,
          orElse: () => metrics.first,
        );

  return Row(
    crossAxisAlignment: CrossAxisAlignment.center,
    children: [
      _TopPostProviderTile(providerKey: item.providerKey),
      const SizedBox(width: AppSpacing.sm + 4),
      Expanded(
        child: Text(
          _shortTitle(item.title),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodyMedium?.copyWith(
            fontWeight: isGitHubTrendingBreakout(item)
                ? FontWeight.w900
                : FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ),
      if (showMetric && primaryMetric != null) ...[
        const SizedBox(width: AppSpacing.md),
        _DensePrimaryMetric(metric: primaryMetric),
      ],
      if (showChip) ...[
        const SizedBox(width: AppSpacing.md),
        _DenseRelevanceChip(supportSignal: supportSignal),
      ],
      const SizedBox(width: AppSpacing.sm),
      rating,
      menu,
    ],
  );
}

/// Compact inline metric (icon plus value) used by the dense row.
class _DensePrimaryMetric extends StatelessWidget {
  const _DensePrimaryMetric({required this.metric});

  final TopPostMetric metric;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Tooltip(
      message: metric.label,
      child: Row(
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
              fontWeight: metric.emphasized ? FontWeight.w900 : FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
        ],
      ),
    );
  }
}

/// Single-line relevance chip reusing the shared relevance badge.
class _DenseRelevanceChip extends StatelessWidget {
  const _DenseRelevanceChip({required this.supportSignal});

  final _TopPostSupportSignal supportSignal;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final badge = _topPostSupportStyle(context, supportSignal);
    return Tooltip(
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
              Text(
                badge.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: textTheme.labelSmall?.copyWith(
                  color: badge.foreground,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
