part of 'reader_summary_brief_surface.dart';

const _initialVisibleTopPosts = 3;
const _githubTrendingProviderKey = 'github-trending-page';

enum _TopPostSort { relevance, engagement }

enum _TopPostBoard { posts, githubTrending }

/// "Top posts" board: sortable, filterable evidence list ranked by relevance
/// and engagement.
class ReaderSummaryTopPosts extends StatefulWidget {
  const ReaderSummaryTopPosts({
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
  State<ReaderSummaryTopPosts> createState() => _ReaderSummaryTopPostsState();
}

class _ReaderSummaryTopPostsState extends State<ReaderSummaryTopPosts> {
  static const _revealBatch = 3;

  _TopPostSort _sort = _TopPostSort.relevance;
  _TopPostBoard _board = _TopPostBoard.posts;
  final Set<String> _hiddenProviders = {};
  bool _denseView = false;
  int _visibleCount = _initialVisibleTopPosts;
  ScrollPosition? _scrollPosition;
  int _totalCount = 0;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final position = Scrollable.maybeOf(context)?.position;
    if (!identical(position, _scrollPosition)) {
      _scrollPosition?.removeListener(_maybeRevealMorePosts);
      _scrollPosition = position?..addListener(_maybeRevealMorePosts);
    }
  }

  @override
  void dispose() {
    _scrollPosition?.removeListener(_maybeRevealMorePosts);
    super.dispose();
  }

  void _maybeRevealMorePosts() {
    final position = _scrollPosition;
    if (position == null || !position.hasPixels || !mounted) {
      return;
    }
    if (_visibleCount >= _totalCount) {
      return;
    }
    final revealDistance = position.hasViewportDimension
        ? position.viewportDimension
        : 600.0;
    if (position.extentAfter < revealDistance) {
      setState(() {
        _visibleCount = (_visibleCount + _revealBatch).clamp(0, _totalCount);
      });
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
    _totalCount = filtered.length;
    final visible = filtered.take(_visibleCount).toList(growable: false);
    if (_visibleCount < _totalCount) {
      // Fill the viewport (and one batch beyond) even before any scrolling.
      WidgetsBinding.instance.addPostFrameCallback(
        (_) => _maybeRevealMorePosts(),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TopPostsHeader(
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
          onSortChanged: (sort) => setState(() => _sort = sort),
          onProviderToggled: (providerKey) => setState(() {
            if (!_hiddenProviders.remove(providerKey)) {
              _hiddenProviders.add(providerKey);
            }
          }),
          onDenseViewChanged: (dense) => setState(() => _denseView = dense),
        ),
        const SizedBox(height: AppSpacing.sm),
        if (visible.isEmpty)
          Padding(
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
          )
        else
          for (final entry in visible.indexed) ...[
            if (entry.$1 > 0)
              Divider(height: 1, color: colorScheme.outlineVariant),
            _TopPostRow(
              index: entry.$1,
              item: entry.$2,
              dateLabel: summaryPeriodDayLabel(widget.period),
              dense: _denseView,
              rating: widget.ratingFor(entry.$2),
              onRated: widget.onRated,
              onOpenUrl: widget.onOpenUrl,
            ),
          ],
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
    setState(() {
      _board = board;
      _visibleCount = _initialVisibleTopPosts;
    });
  }
}

class _TopPostsHeader extends StatelessWidget {
  const _TopPostsHeader({
    required this.board,
    required this.sort,
    required this.showBoardToggle,
    required this.postCount,
    required this.githubTrendingCount,
    required this.curatedTopPostCount,
    required this.selectedPostCount,
    required this.providerKeys,
    required this.hiddenProviders,
    required this.denseView,
    required this.onBoardChanged,
    required this.onSortChanged,
    required this.onProviderToggled,
    required this.onDenseViewChanged,
  });

  final _TopPostBoard board;
  final _TopPostSort sort;
  final bool showBoardToggle;
  final int postCount;
  final int githubTrendingCount;
  final int curatedTopPostCount;
  final int selectedPostCount;
  final List<String> providerKeys;
  final Set<String> hiddenProviders;
  final bool denseView;
  final ValueChanged<_TopPostBoard> onBoardChanged;
  final ValueChanged<_TopPostSort> onSortChanged;
  final ValueChanged<String> onProviderToggled;
  final ValueChanged<bool> onDenseViewChanged;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final titles = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _topPostBoardTitle(board),
          style: textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 2),
        Text(
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
        ),
      ],
    );
    final controls = Wrap(
      spacing: AppSpacing.sm + 4,
      runSpacing: AppSpacing.sm,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (showBoardToggle)
          _TopPostBoardToggle(
            board: board,
            postCount: postCount,
            githubTrendingCount: githubTrendingCount,
            onChanged: onBoardChanged,
          ),
        Text(
          'Sort by',
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        _TopPostSortMenu(sort: sort, onSortChanged: onSortChanged),
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

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth < 640) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              titles,
              const SizedBox(height: AppSpacing.sm),
              controls,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Expanded(child: titles),
            controls,
          ],
        );
      },
    );
  }
}

bool _isGithubTrendingTopRead(TopRead item) =>
    item.providerKey.trim().toLowerCase() == _githubTrendingProviderKey;

String _topPostBoardTitle(_TopPostBoard board) {
  return switch (board) {
    _TopPostBoard.posts => 'Top posts',
    _TopPostBoard.githubTrending => 'GitHub Trending',
  };
}

String _topPostBoardSubtitle(
  _TopPostBoard board, {
  required int curatedTopPostCount,
  required int selectedPostCount,
}) {
  return switch (board) {
    _TopPostBoard.posts =>
      selectedPostCount > curatedTopPostCount && curatedTopPostCount > 0
          ? '$curatedTopPostCount top posts from $selectedPostCount selected'
          : 'Ranked by relevance and engagement',
    _TopPostBoard.githubTrending => 'Repositories ranked by GitHub momentum',
  };
}
