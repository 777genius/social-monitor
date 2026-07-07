part of 'reader_summary_brief_surface.dart';

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
  final int? Function(TopRead item) ratingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )
  onRated;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryTopPostsSliver> createState() =>
      _ReaderSummaryTopPostsSliverState();
}

class _ReaderSummaryTopPostsSliverState
    extends State<ReaderSummaryTopPostsSliver> {
  _TopPostSort _sort = _TopPostSort.relevance;
  _TopPostBoard _board = _TopPostBoard.posts;
  final Set<String> _hiddenProviders = {};
  bool _denseView = false;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final postItems = widget.items
        .where((item) => !_isGithubTrendingTopRead(item))
        .toList(growable: false);
    final githubTrendingItems = widget.items
        .where(_isGithubTrendingTopRead)
        .toList(growable: false);
    final activeBoard = _resolveBoard(
      hasPosts: postItems.isNotEmpty,
      hasGithubTrending: githubTrendingItems.isNotEmpty,
    );
    final boardItems = switch (activeBoard) {
      _TopPostBoard.posts => postItems,
      _TopPostBoard.githubTrending => githubTrendingItems,
    };
    final filtered =
        boardItems
            .where((item) => !_hiddenProviders.contains(item.providerKey))
            .toList(growable: false)
          ..sort(_compare);
    final reservePreviewSpace = filtered.any(
      (item) => item.previewMedia != null,
    );

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _TopPostsHeader(
            board: activeBoard,
            sort: _sort,
            showBoardToggle:
                postItems.isNotEmpty && githubTrendingItems.isNotEmpty,
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
            itemCount: filtered.length * 2 - 1,
            itemBuilder: (context, index) {
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
                rating: widget.ratingFor(item),
                onRated: widget.onRated,
                onOpenUrl: widget.onOpenUrl,
              );
            },
          ),
      ],
    );
  }

  int _compare(TopRead a, TopRead b) {
    return switch (_sort) {
      _TopPostSort.relevance => _compareRelevance(a, b),
      _TopPostSort.engagement => topPostEngagementScore(
        b,
      ).compareTo(topPostEngagementScore(a)),
    };
  }

  int _compareRelevance(TopRead a, TopRead b) {
    final relevanceDiff = topPostRelevanceSortScore(
      b,
    ).compareTo(topPostRelevanceSortScore(a));
    if (relevanceDiff != 0) {
      return relevanceDiff;
    }

    final signalDiff = b.signalScore.value.compareTo(a.signalScore.value);
    if (signalDiff != 0) {
      return signalDiff;
    }

    return topPostEngagementScore(b).compareTo(topPostEngagementScore(a));
  }

  _TopPostBoard _resolveBoard({
    required bool hasPosts,
    required bool hasGithubTrending,
  }) {
    if (_board == _TopPostBoard.githubTrending && hasGithubTrending) {
      return _TopPostBoard.githubTrending;
    }
    if (_board == _TopPostBoard.posts && hasPosts) {
      return _TopPostBoard.posts;
    }
    if (hasGithubTrending && !hasPosts) {
      return _TopPostBoard.githubTrending;
    }
    return _TopPostBoard.posts;
  }

  void _setBoard(_TopPostBoard board) {
    setState(() => _board = board);
  }

  void _setSort(_TopPostSort sort) {
    setState(() => _sort = sort);
  }

  void _toggleProvider(String providerKey) {
    setState(() {
      if (!_hiddenProviders.remove(providerKey)) {
        _hiddenProviders.add(providerKey);
      }
    });
  }

  void _setDenseView(bool dense) {
    setState(() => _denseView = dense);
  }
}
