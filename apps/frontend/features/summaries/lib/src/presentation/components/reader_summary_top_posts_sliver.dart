part of 'reader_summary_brief_surface.dart';

class ReaderSummaryTopPostsSliver extends StatefulWidget {
  const ReaderSummaryTopPostsSliver({
    super.key,
    required this.projection,
    required this.selectedPostCount,
    required this.period,
    required this.citationsById,
    required this.ratingFor,
    required this.onRated,
    required this.onOpenUrl,
  });

  final ReaderSummaryTopPostsProjection projection;
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
  _TopPostSort _sort = _TopPostSort.editorial;
  late _TopPostBoard _board;
  late final TopPostsContinuationWindow _continuation;
  late List<TopRead> _boardItems;
  late List<TopRead> _filteredItems;
  late List<String> _providerKeys;
  late bool _reservePreviewSpace;
  final Set<String> _hiddenProviders = {};
  ScrollPosition? _scrollPosition;
  double? _lastObservedScrollPixels;
  int _userScrollSerial = 0;
  int _lastRevealUserScrollSerial = 0;
  bool _denseView = false;

  @override
  void initState() {
    super.initState();
    _board = _availableTopPostBoard(widget.projection.items);
    _continuation = TopPostsContinuationWindow(
      initialVisibleCount: readerSummaryCuratedTopPostLimit,
    );
    _refreshBoardItems();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final scrollPosition = Scrollable.maybeOf(context)?.position;
    if (identical(scrollPosition, _scrollPosition)) {
      return;
    }
    _scrollPosition?.removeListener(_handleScrollPositionChanged);
    _scrollPosition = scrollPosition;
    _lastObservedScrollPixels = scrollPosition?.hasPixels == true
        ? scrollPosition!.pixels
        : null;
    _scrollPosition?.addListener(_handleScrollPositionChanged);
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPostsSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    final datasetChanged = !widget.projection.hasSameDatasetAs(
      oldWidget.projection,
    );
    final periodChanged = widget.period != oldWidget.period;
    if (datasetChanged || periodChanged) {
      _continuation.reset(
        initialVisibleCount: readerSummaryCuratedTopPostLimit,
      );
      _requireFreshUserScroll();
    }
    _board = _availableTopPostBoard(
      widget.projection.items,
      preferred: _board,
    );
    _refreshBoardItems();
  }

  @override
  void dispose() {
    _scrollPosition?.removeListener(_handleScrollPositionChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final activeBoard = _board;
    final filtered = _filteredItems;
    final visibleItemCount = activeBoard == _TopPostBoard.posts
        ? _continuation.visibleItemCount(filtered.length)
        : filtered.length;
    final hasMoreItems =
        activeBoard == _TopPostBoard.posts &&
        visibleItemCount < filtered.length;
    final sliverItemCount = hasMoreItems
        ? math.max(1, visibleItemCount * 2)
        : math.max(0, visibleItemCount * 2 - 1);

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _TopPostsHeader(
            board: activeBoard,
            sort: _sort,
            postCount: widget.projection.posts.length,
            githubTrendingCount: widget.projection.githubTrendingPosts.length,
            curatedTopPostCount: widget.projection.curatedPosts.length,
            selectedPostCount: widget.selectedPostCount,
            providerKeys: _providerKeys,
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
                  generation: _continuation.generation,
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
                  'reader-summary-top-post-'
                  '${readerSummaryTopPostIdentity(item)}-$itemIndex',
                ),
                index: itemIndex,
                item: item,
                dateLabel: _topPostDateLabel(item, widget.period),
                citationsById: widget.citationsById,
                dense: _denseView,
                reservePreviewSpace: _reservePreviewSpace,
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
      _resetContinuation();
      _refreshBoardItems();
    });
  }

  void _setSort(_TopPostSort sort) {
    if (_sort == sort) {
      return;
    }
    setState(() {
      _sort = sort;
      _resetContinuation();
      _refreshBoardItems();
    });
  }

  void _toggleProvider(String providerKey) {
    setState(() {
      if (!_hiddenProviders.remove(providerKey)) {
        _hiddenProviders.add(providerKey);
      }
      _resetContinuation();
      _refreshBoardItems();
    });
  }

  void _setDenseView(bool dense) {
    if (_denseView == dense) {
      return;
    }
    setState(() {
      _denseView = dense;
    });
  }

  bool _revealMoreItems(int generation) {
    if (!mounted ||
        _board != _TopPostBoard.posts ||
        generation != _continuation.generation ||
        _userScrollSerial <= _lastRevealUserScrollSerial ||
        _continuation.visibleItemCount(_filteredItems.length) >=
            _filteredItems.length) {
      return false;
    }
    var didReveal = false;
    setState(() {
      didReveal = _continuation.revealNext(
        generation: generation,
        totalItemCount: _filteredItems.length,
      );
      if (didReveal) {
        _lastRevealUserScrollSerial = _userScrollSerial;
      }
    });
    return didReveal;
  }

  void _resetContinuation() {
    _continuation.reset(
      initialVisibleCount: readerSummaryCuratedTopPostLimit,
    );
    _requireFreshUserScroll();
  }

  void _handleScrollPositionChanged() {
    final position = _scrollPosition;
    if (position == null || !position.hasPixels) {
      return;
    }
    final pixels = position.pixels;
    final pixelsChanged = _lastObservedScrollPixels != pixels;
    _lastObservedScrollPixels = pixels;
    if (pixelsChanged && position.userScrollDirection != ScrollDirection.idle) {
      _userScrollSerial += 1;
    }
  }

  void _requireFreshUserScroll() {
    _lastRevealUserScrollSerial = _userScrollSerial;
  }

  void _refreshBoardItems() {
    _boardItems = switch (_board) {
      _TopPostBoard.posts => widget.projection.posts,
      _TopPostBoard.githubTrending => widget.projection.githubTrendingPosts,
    };
    _providerKeys = {
      for (final item in _boardItems) item.providerKey,
    }.toList(growable: false);
    _filteredItems = orderTopPosts(
      _boardItems.where(
        (item) => !_hiddenProviders.contains(item.providerKey),
      ),
      byEngagement:
          _board == _TopPostBoard.posts && _sort == _TopPostSort.engagement,
    );
    _reservePreviewSpace = _filteredItems.any(
      (item) => item.previewMedia != null,
    );
  }
}
