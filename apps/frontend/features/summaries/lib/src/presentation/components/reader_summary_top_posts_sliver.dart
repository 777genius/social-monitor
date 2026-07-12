part of 'reader_summary_brief_surface.dart';

const _topPostsInitialVisibleCount = 24;
const _topPostsRevealBatchSize = 24;

class ReaderSummaryTopPostsSliver extends StatefulWidget {
  const ReaderSummaryTopPostsSliver({
    super.key,
    required this.items,
    required this.curatedTopPostCount,
    required this.selectedPostCount,
    required this.period,
    required this.citationsById,
    required this.ratingFor,
    required this.onRated,
    required this.onOpenUrl,
  });

  final List<TopRead> items;
  final int curatedTopPostCount;
  final int selectedPostCount;
  final SummaryPeriod period;
  final Map<String, SummaryCitation> citationsById;
  final int? Function(TopRead item)? ratingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onRated;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryTopPostsSliver> createState() =>
      _ReaderSummaryTopPostsSliverState();
}

class _ReaderSummaryTopPostsSliverState
    extends State<ReaderSummaryTopPostsSliver> {
  ReaderSummaryTopPostSort _postSort = ReaderSummaryTopPostSort.relevance;
  ReaderSummaryTopPostSort _githubTrendingSort =
      ReaderSummaryTopPostSort.githubPosition;
  late _TopPostBoard _board;
  final Set<String> _hiddenProviders = {};
  int _visibleItemLimit = _topPostsInitialVisibleCount;
  bool _denseView = false;

  @override
  void initState() {
    super.initState();
    _board = widget.items.any((item) => !_isGithubTrendingTopRead(item))
        ? _TopPostBoard.posts
        : _TopPostBoard.githubTrending;
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPostsSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.items != oldWidget.items) {
      _visibleItemLimit = _topPostsInitialVisibleCount;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final postItems = widget.items
        .where((item) => !_isGithubTrendingTopRead(item))
        .toList(growable: false);
    final githubTrendingItems = widget.items
        .where(_isGithubTrendingTopRead)
        .toList(growable: false);
    final activeBoard = _board;
    final activeSort = _sortFor(activeBoard);
    final boardItems = switch (activeBoard) {
      _TopPostBoard.posts => postItems,
      _TopPostBoard.githubTrending => githubTrendingItems,
    };
    final filtered =
        boardItems
            .where((item) => !_hiddenProviders.contains(item.providerKey))
            .toList(growable: false)
          ..sort((first, second) {
            return compareReaderSummaryTopPosts(first, second, activeSort);
          });
    final reservePreviewSpace = filtered.any(
      (item) => item.previewMedia != null,
    );
    final visibleItemCount = math.min(filtered.length, _visibleItemLimit);
    final hasMoreItems = visibleItemCount < filtered.length;
    final sliverItemCount = hasMoreItems
        ? visibleItemCount * 2
        : visibleItemCount * 2 - 1;

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _TopPostsHeader(
            board: activeBoard,
            sort: activeSort,
            postCount: postItems.length,
            githubTrendingCount: githubTrendingItems.length,
            curatedTopPostCount: widget.curatedTopPostCount,
            selectedPostCount: widget.selectedPostCount,
            providerKeys: {
              for (final item in boardItems) item.providerKey,
            }.toList(growable: false),
            hiddenProviders: _hiddenProviders,
            denseView: _denseView,
            onBoardChanged: _setBoard,
            onSortChanged: _setSort,
            onProviderToggled: _toggleProvider,
            onDenseViewChanged: _setDenseView,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        if (filtered.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
              child: Text(
                activeBoard == _TopPostBoard.githubTrending
                    ? 'No GitHub Trending repositories in this summary window.'
                    : 'No posts match the current source filters.',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          )
        else
          SliverList.builder(
            itemCount: sliverItemCount,
            itemBuilder: (context, index) {
              if (hasMoreItems && index == sliverItemCount - 1) {
                return _TopPostsRevealTrigger(
                  remainingCount: filtered.length - visibleItemCount,
                  onReveal: _revealMoreItems,
                );
              }

              if (index.isOdd) {
                return Divider(height: 1, color: colorScheme.outlineVariant);
              }

              final itemIndex = index ~/ 2;
              final item = filtered[itemIndex];
              return _TopPostRow(
                key: ValueKey(
                  'reader-summary-top-post-${_topPostStableId(item)}',
                ),
                index: itemIndex,
                item: item,
                dateLabel: _topPostDateLabel(item, widget.period),
                citationsById: widget.citationsById,
                dense: _denseView,
                reservePreviewSpace: reservePreviewSpace,
                rating: widget.ratingFor?.call(item),
                onRated: widget.onRated,
                onOpenUrl: widget.onOpenUrl,
              );
            },
          ),
      ],
    );
  }

  void _setBoard(_TopPostBoard board) {
    if (_board == board) {
      return;
    }
    setState(() {
      _board = board;
      _visibleItemLimit = _topPostsInitialVisibleCount;
    });
  }

  ReaderSummaryTopPostSort _sortFor(_TopPostBoard board) {
    return switch (board) {
      _TopPostBoard.posts => _postSort,
      _TopPostBoard.githubTrending => _githubTrendingSort,
    };
  }

  void _setSort(ReaderSummaryTopPostSort sort) {
    if (_sortFor(_board) == sort) {
      return;
    }
    setState(() {
      switch (_board) {
        case _TopPostBoard.posts:
          _postSort = sort;
        case _TopPostBoard.githubTrending:
          _githubTrendingSort = sort;
      }
      _visibleItemLimit = _topPostsInitialVisibleCount;
    });
  }

  void _toggleProvider(String providerKey) {
    setState(() {
      if (!_hiddenProviders.remove(providerKey)) {
        _hiddenProviders.add(providerKey);
      }
      _visibleItemLimit = _topPostsInitialVisibleCount;
    });
  }

  void _setDenseView(bool dense) {
    if (_denseView == dense) {
      return;
    }
    setState(() {
      _denseView = dense;
      _visibleItemLimit = _topPostsInitialVisibleCount;
    });
  }

  void _revealMoreItems() {
    if (!mounted) {
      return;
    }
    setState(() {
      _visibleItemLimit += _topPostsRevealBatchSize;
    });
  }
}

class _TopPostsRevealTrigger extends StatefulWidget {
  const _TopPostsRevealTrigger({
    required this.remainingCount,
    required this.onReveal,
  });

  final int remainingCount;
  final VoidCallback onReveal;

  @override
  State<_TopPostsRevealTrigger> createState() => _TopPostsRevealTriggerState();
}

class _TopPostsRevealTriggerState extends State<_TopPostsRevealTrigger> {
  int? _scheduledRemainingCount;

  @override
  void initState() {
    super.initState();
    _scheduleReveal();
  }

  @override
  void didUpdateWidget(covariant _TopPostsRevealTrigger oldWidget) {
    super.didUpdateWidget(oldWidget);
    _scheduleReveal();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Center(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 16,
              height: 16,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colorScheme.primary,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Text(
              'Loading more top posts',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _scheduleReveal() {
    if (widget.remainingCount <= 0 ||
        _scheduledRemainingCount == widget.remainingCount) {
      return;
    }
    _scheduledRemainingCount = widget.remainingCount;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      widget.onReveal();
    });
  }
}
