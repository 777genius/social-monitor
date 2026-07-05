part of 'reader_summary_brief_surface.dart';

class ReaderSummaryTopicMapPanel extends StatelessWidget {
  const ReaderSummaryTopicMapPanel({super.key, required this.topicMap});

  final ReaderSummaryTopicMap topicMap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final muted = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkTextMuted
        : AppColors.textMuted;
    final borderColor = Theme.of(context).brightness == Brightness.dark
        ? AppColors.darkBorder
        : AppColors.border;

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Topic map',
          style: textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        LayoutBuilder(
          builder: (context, constraints) {
            final width = constraints.maxWidth.isFinite
                ? constraints.maxWidth
                : 640.0;
            final height = width < 420 ? 300.0 : 360.0;

            return Semantics(
              label: _topicMapSemanticLabel(topicMap),
              child: SizedBox(
                width: width,
                height: height,
                child: _TopicMapForceGraph(
                  topicMap: topicMap,
                  graphSize: Size(width, height),
                  textColor: colorScheme.onSurface,
                  mutedColor: muted,
                  borderColor: borderColor,
                ),
              ),
            );
          },
        ),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.xs,
          children: [
            for (final group in _topicMapLegendGroups(topicMap).take(6))
              _TopicGroupLegendChip(group: group),
          ],
        ),
      ],
    );
  }
}

class _TopicGroupLegendChip extends StatelessWidget {
  const _TopicGroupLegendChip({required this.group});

  final ReaderSummaryTopicMapGroup group;

  @override
  Widget build(BuildContext context) {
    final color = _topicColor(group.colorKey);
    final textTheme = Theme.of(context).textTheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color.withValues(alpha: 0.32)),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            DecoratedBox(
              decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              child: const SizedBox(width: 8, height: 8),
            ),
            const SizedBox(width: AppSpacing.xs),
            Text(
              group.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.labelSmall?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
