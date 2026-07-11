part of 'reader_summary_brief_surface.dart';

class _TopPostBoardToggle extends StatelessWidget {
  const _TopPostBoardToggle({
    required this.board,
    required this.postCount,
    required this.githubTrendingCount,
    required this.onChanged,
  });

  final _TopPostBoard board;
  final int postCount;
  final int githubTrendingCount;
  final ValueChanged<_TopPostBoard> onChanged;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return LayoutBuilder(
      builder: (context, constraints) {
        final showCounts = constraints.maxWidth >= 400;
        return Semantics(
          container: true,
          label: 'Top post categories',
          child: DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: colorScheme.outlineVariant),
              ),
            ),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Row(
                  children: [
                    Expanded(
                      child: _TopPostBoardToggleSegment(
                        key: const ValueKey(
                          'reader-summary-top-posts-board-posts',
                        ),
                        label: 'Top posts',
                        count: postCount,
                        showCount: showCounts,
                        selected: board == _TopPostBoard.posts,
                        leading: const Icon(Icons.article_outlined, size: 17),
                        onPressed: () => onChanged(_TopPostBoard.posts),
                      ),
                    ),
                    Expanded(
                      child: _TopPostBoardToggleSegment(
                        key: const ValueKey(
                          'reader-summary-top-posts-board-github',
                        ),
                        label: 'GitHub trends',
                        count: githubTrendingCount,
                        showCount: showCounts,
                        selected: board == _TopPostBoard.githubTrending,
                        leading: const ReaderSummaryProviderLogo(
                          providerKey: _githubTrendingProviderKey,
                          size: 17,
                        ),
                        onPressed: () =>
                            onChanged(_TopPostBoard.githubTrending),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _TopPostBoardToggleSegment extends StatelessWidget {
  const _TopPostBoardToggleSegment({
    super.key,
    required this.label,
    required this.count,
    required this.showCount,
    required this.selected,
    required this.leading,
    required this.onPressed,
  });

  final String label;
  final int count;
  final bool showCount;
  final bool selected;
  final Widget leading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final foreground = selected
        ? colorScheme.primary
        : colorScheme.onSurfaceVariant;
    return Semantics(
      selected: selected,
      button: true,
      label: '$label, $count items',
      onTap: selected ? null : onPressed,
      child: ExcludeSemantics(
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: selected ? null : onPressed,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 160),
              constraints: const BoxConstraints(minHeight: 44),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
              decoration: BoxDecoration(
                color: selected
                    ? colorScheme.primary.withValues(alpha: 0.07)
                    : Colors.transparent,
                border: Border(
                  bottom: BorderSide(
                    color: selected ? colorScheme.primary : Colors.transparent,
                    width: 2,
                  ),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  IconTheme(
                    data: IconThemeData(color: foreground, size: 17),
                    child: leading,
                  ),
                  const SizedBox(width: AppSpacing.xs + 2),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: textTheme.titleSmall?.copyWith(
                        color: foreground,
                        fontWeight: selected
                            ? FontWeight.w800
                            : FontWeight.w600,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                  if (showCount) ...[
                    const SizedBox(width: AppSpacing.xs),
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: selected
                            ? colorScheme.primary.withValues(alpha: 0.14)
                            : colorScheme.surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 6,
                          vertical: 2,
                        ),
                        child: Text(
                          '$count',
                          style: textTheme.labelSmall?.copyWith(
                            color: foreground,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0,
                          ),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
