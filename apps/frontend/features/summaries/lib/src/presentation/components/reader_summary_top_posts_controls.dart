part of 'reader_summary_brief_surface.dart';

class _TopPostSortMenu extends StatelessWidget {
  const _TopPostSortMenu({required this.sort, required this.onSortChanged});

  final _TopPostSort sort;
  final ValueChanged<_TopPostSort> onSortChanged;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return PopupMenuButton<_TopPostSort>(
      key: const ValueKey('reader-summary-top-posts-sort'),
      tooltip: 'Sort top posts',
      position: PopupMenuPosition.under,
      onSelected: onSortChanged,
      itemBuilder: (context) => [
        for (final option in _TopPostSort.values)
          PopupMenuItem<_TopPostSort>(
            value: option,
            child: Row(
              children: [
                Expanded(child: Text(_sortLabel(option))),
                if (option == sort) const Icon(Icons.check, size: 18),
              ],
            ),
          ),
      ],
      child: _TopPostControlSurface(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _sortLabel(sort),
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w600,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(width: AppSpacing.xs),
            Icon(
              Icons.keyboard_arrow_down_rounded,
              size: 18,
              color: colorScheme.onSurfaceVariant,
            ),
          ],
        ),
      ),
    );
  }

  String _sortLabel(_TopPostSort value) {
    return switch (value) {
      _TopPostSort.relevance => 'Relevance',
      _TopPostSort.engagement => 'Engagement',
    };
  }
}

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
    return PopupMenuButton<String>(
      key: const ValueKey('reader-summary-top-posts-filters'),
      tooltip: 'Filter top posts by source',
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
          child: Tooltip(
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
