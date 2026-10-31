part of 'reader_summary_brief_surface.dart';

class _TopPostsHeader extends StatelessWidget {
  const _TopPostsHeader({
    required this.board,
    required this.topPostCount,
    required this.additionalStoryCount,
    required this.curatedTopPostCount,
    required this.selectedPostCount,
    required this.providerKeys,
    required this.hiddenProviders,
    required this.denseView,
    required this.sortOrder,
    required this.onBoardChanged,
    required this.onProviderToggled,
    required this.onDenseViewChanged,
    required this.onSortOrderChanged,
  });

  final _TopPostBoard board;
  final int topPostCount;
  final int additionalStoryCount;
  final int curatedTopPostCount;
  final int selectedPostCount;
  final List<String> providerKeys;
  final Set<String> hiddenProviders;
  final bool denseView;
  final TopPostsSortOrder sortOrder;
  final ValueChanged<_TopPostBoard> onBoardChanged;
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
      _topPostBoardSubtitle(
        board,
        curatedTopPostCount: curatedTopPostCount,
        selectedPostCount: selectedPostCount,
      ),
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
        _TopPostBoardToggle(
          board: board,
          topPostCount: topPostCount,
          additionalStoryCount: additionalStoryCount,
          onChanged: onBoardChanged,
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

String _topPostBoardSubtitle(
  _TopPostBoard board, {
  required int curatedTopPostCount,
  required int selectedPostCount,
}) {
  return switch (board) {
    _TopPostBoard.topPosts =>
      curatedTopPostCount == 1
          ? '1 editorial pick from $selectedPostCount selected'
          : '$curatedTopPostCount editorial picks from '
                '$selectedPostCount selected',
    _TopPostBoard.additionalStories =>
      'Additional selected stories and explicitly related topics',
  };
}

/// Stable row key: the card identity, independent of its position, so a row
/// keeps its element when the order or the source filters move it.
ValueKey<String> _topPostRowKey(TopRead item) =>
    ValueKey('reader-summary-top-post-${readerSummaryTopPostIdentity(item)}');
