part of 'reader_summary_brief_surface.dart';

class _TopPostsHeader extends StatelessWidget {
  const _TopPostsHeader({
    required this.visibleCount,
    required this.availableCount,
    required this.providerKeys,
    required this.hiddenProviders,
    required this.denseView,
    required this.sortOrder,
    required this.onProviderToggled,
    required this.onDenseViewChanged,
    required this.onSortOrderChanged,
  });

  final int visibleCount;
  final int availableCount;
  final List<String> providerKeys;
  final Set<String> hiddenProviders;
  final bool denseView;
  final TopPostsSortOrder sortOrder;
  final ValueChanged<String> onProviderToggled;
  final ValueChanged<bool> onDenseViewChanged;

  /// `null` hides the order control; the lanes keep the model order.
  final ValueChanged<TopPostsSortOrder>? onSortOrderChanged;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final onSortOrderChanged = this.onSortOrderChanged;
    final subtitle = Text(
      'Showing $visibleCount of $availableCount ranked posts',
      style: textTheme.labelSmall?.copyWith(
        color: colorScheme.onSurfaceVariant,
        fontWeight: FontWeight.w600,
        letterSpacing: 0,
      ),
    );
    final controls = Wrap(
      spacing: AppSpacing.sm + 4,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (onSortOrderChanged != null)
          _TopPostSortToggle(
            sortOrder: sortOrder,
            onSortOrderChanged: onSortOrderChanged,
          ),
        if (providerKeys.isNotEmpty)
          _TopPostFilterMenu(
            providerKeys: providerKeys,
            hiddenProviders: hiddenProviders,
            onProviderToggled: onProviderToggled,
          ),
        _TopPostViewToggle(
          denseView: denseView,
          onDenseViewChanged: onDenseViewChanged,
        ),
      ],
    );
    final hasBoardItems = providerKeys.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Top posts',
          style: textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 640) {
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  subtitle,
                  if (hasBoardItems) ...[
                    const SizedBox(height: AppSpacing.sm),
                    controls,
                  ],
                ],
              );
            }
            return Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(child: subtitle),
                if (hasBoardItems) controls,
              ],
            );
          },
        ),
      ],
    );
  }
}

/// Stable row key: the card identity, independent of its position, so a row
/// keeps its element when the order or the source filters move it.
ValueKey<String> _topPostRowKey(TopRead item) =>
    ValueKey('reader-summary-top-post-${readerSummaryTopPostIdentity(item)}');
