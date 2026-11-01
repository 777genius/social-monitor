part of 'reader_summary_brief_surface.dart';

/// "By model" / "By likes" order of the visible lane.
class _TopPostSortToggle extends StatelessWidget {
  const _TopPostSortToggle({
    required this.sortOrder,
    required this.onSortOrderChanged,
  });

  final TopPostsSortOrder sortOrder;
  final ValueChanged<TopPostsSortOrder> onSortOrderChanged;

  @override
  Widget build(BuildContext context) {
    // The compact header stacks its controls full width; the wide header
    // lays them out in a row with unbounded width.
    return LayoutBuilder(
      builder: (context, constraints) => AppSegmentedControl<TopPostsSortOrder>(
        key: const ValueKey('reader-summary-top-posts-sort'),
        semanticLabel: 'Top posts order',
        selected: sortOrder,
        onChanged: onSortOrderChanged,
        expanded: constraints.hasBoundedWidth,
        segments: _topPostSortSegments,
      ),
    );
  }
}

const _topPostSortSegments = [
  AppSegment(
    key: ValueKey('reader-summary-top-posts-sort-model'),
    value: TopPostsSortOrder.modelRank,
    label: 'By model',
    icon: Icons.auto_awesome_outlined,
    semanticLabel: 'Sort by model rank',
    tooltip: 'Model order: importance first, then popularity',
  ),
  AppSegment(
    key: ValueKey('reader-summary-top-posts-sort-likes'),
    value: TopPostsSortOrder.engagement,
    label: 'By likes',
    icon: Icons.favorite_border_rounded,
    semanticLabel: 'Sort by likes',
    tooltip:
        'Most liked first: X likes + 2x reposts, Reddit score, '
        'Hacker News points, GitHub stars. Posts without a metric '
        'stay last.',
  ),
];

class _TopPostFilterMenu extends StatelessWidget {
  const _TopPostFilterMenu({
    required this.providerKeys,
    required this.hiddenProviders,
    required this.onProviderToggled,
  });

  final List<String> providerKeys;
  final Set<String> hiddenProviders;
  final ValueChanged<String> onProviderToggled;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return MergeSemantics(
      child: AppTooltip(
        message: 'Filter posts by source',
        child: PopupMenuButton<String>(
          key: const ValueKey('reader-summary-top-posts-filters'),
          tooltip: '',
          position: PopupMenuPosition.under,
          onSelected: onProviderToggled,
          itemBuilder: (context) => [
            for (final providerKey in providerKeys)
              CheckedPopupMenuItem<String>(
                value: providerKey,
                checked: !hiddenProviders.contains(providerKey),
                child: Text(readerSummaryProviderLabel(providerKey)),
              ),
          ],
          child: _TopPostControlSurface(
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.tune_rounded,
                  size: 15,
                  color: colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: AppSpacing.xs + 2),
                Text(
                  'Filters',
                  style: textTheme.bodySmall?.copyWith(
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TopPostViewToggle extends StatelessWidget {
  const _TopPostViewToggle({
    required this.denseView,
    required this.onDenseViewChanged,
  });

  final bool denseView;
  final ValueChanged<bool> onDenseViewChanged;

  @override
  Widget build(BuildContext context) {
    return _TopPostControlSurface(
      padded: false,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _TopPostViewToggleButton(
            key: const ValueKey('reader-summary-top-posts-view-list'),
            tooltip: 'Detailed list',
            icon: Icons.format_list_bulleted_rounded,
            selected: !denseView,
            onPressed: () => onDenseViewChanged(false),
          ),
          _TopPostViewToggleButton(
            key: const ValueKey('reader-summary-top-posts-view-compact'),
            tooltip: 'Compact list',
            icon: Icons.grid_view_rounded,
            selected: denseView,
            onPressed: () => onDenseViewChanged(true),
          ),
        ],
      ),
    );
  }
}

class _TopPostViewToggleButton extends StatelessWidget {
  const _TopPostViewToggleButton({
    super.key,
    required this.tooltip,
    required this.icon,
    required this.selected,
    required this.onPressed,
  });

  final String tooltip;
  final IconData icon;
  final bool selected;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.all(3),
      child: Material(
        color: selected
            ? colorScheme.primary.withValues(alpha: 0.1)
            : Colors.transparent,
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(7)),
        child: InkWell(
          onTap: selected ? null : onPressed,
          child: AppTooltip(
            message: tooltip,
            child: SizedBox.square(
              dimension: 28,
              child: Icon(
                icon,
                size: 15,
                color: selected
                    ? colorScheme.primary
                    : colorScheme.onSurfaceVariant,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TopPostControlSurface extends StatelessWidget {
  const _TopPostControlSurface({required this.child, this.padded = true});

  final Widget child;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(10),
      ),
      child: SizedBox(
        height: 36,
        child: Padding(
          padding: padded
              ? const EdgeInsets.symmetric(horizontal: AppSpacing.sm + 4)
              : EdgeInsets.zero,
          child: Center(child: child),
        ),
      ),
    );
  }
}
