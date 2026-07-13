part of 'reader_summary_brief_surface.dart';

const _githubTrendingProviderKey = 'github-trending-page';

enum _TopPostSort { editorial, engagement }

enum _TopPostBoard { posts, githubTrending }

/// "Top posts" board: sortable, filterable editorial picks with an optional
/// engagement view.
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
  final int? Function(TopRead item)? ratingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onRated;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryTopPosts> createState() => _ReaderSummaryTopPostsState();
}

class _ReaderSummaryTopPostsState extends State<ReaderSummaryTopPosts> {
  _TopPostSort _sort = _TopPostSort.editorial;
  late _TopPostBoard _board;
  final Set<String> _hiddenProviders = {};
  final ScrollController _postsScrollController = ScrollController();
  bool _denseView = false;

  @override
  void initState() {
    super.initState();
    _board = _availableTopPostBoard(widget.items);
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPosts oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.items != oldWidget.items) {
      _board = _availableTopPostBoard(widget.items, preferred: _board);
    }
  }

  @override
  void dispose() {
    _postsScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final postItems = widget.items
        .where((item) => !_isGithubTrendingTopRead(item))
        .toList(growable: false);
    final githubTrendingItems = orderGitHubTrendingPosts(
      widget.items.where(_isGithubTrendingTopRead),
    );
    final activeBoard = _board;
    final boardItems = switch (activeBoard) {
      _TopPostBoard.posts => postItems,
      _TopPostBoard.githubTrending => githubTrendingItems,
    };
    final filtered = orderTopPosts(
      boardItems.where((item) => !_hiddenProviders.contains(item.providerKey)),
      byEngagement:
          activeBoard == _TopPostBoard.posts &&
          _sort == _TopPostSort.engagement,
    );
    final reservePreviewSpace = filtered.any(
      (item) => item.previewMedia != null,
    );
    final listHeight = _topPostsListViewportHeight(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TopPostsHeader(
          board: activeBoard,
          sort: _sort,
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
        const SizedBox(height: AppSpacing.sm),
        if (filtered.isEmpty)
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
          SizedBox(
            height: listHeight,
            child: Scrollbar(
              controller: _postsScrollController,
              child: ListView.separated(
                controller: _postsScrollController,
                primary: false,
                cacheExtent: listHeight,
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                itemCount: filtered.length,
                separatorBuilder: (context, index) =>
                    Divider(height: 1, color: colorScheme.outlineVariant),
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  return _TopPostRow(
                    key: ValueKey(
                      'reader-summary-top-post-${_topPostStableId(item)}',
                    ),
                    index: index,
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
            ),
          ),
      ],
    );
  }

  void _setBoard(_TopPostBoard board) {
    setState(() {
      _board = board;
    });
    _resetPostsScroll();
  }

  void _setSort(_TopPostSort sort) {
    setState(() => _sort = sort);
    _resetPostsScroll();
  }

  void _toggleProvider(String providerKey) {
    setState(() {
      if (!_hiddenProviders.remove(providerKey)) {
        _hiddenProviders.add(providerKey);
      }
    });
    _resetPostsScroll();
  }

  void _setDenseView(bool dense) {
    setState(() => _denseView = dense);
    _resetPostsScroll();
  }

  void _resetPostsScroll() {
    if (!_postsScrollController.hasClients) {
      return;
    }
    _postsScrollController.jumpTo(0);
  }
}

double _topPostsListViewportHeight(BuildContext context) {
  final windowHeight = MediaQuery.sizeOf(context).height;
  if (!windowHeight.isFinite || windowHeight <= 0) {
    return 620;
  }
  return (windowHeight * 0.68).clamp(360.0, 760.0).toDouble();
}

String _topPostStableId(TopRead item) {
  final canonicalUrl = item.canonicalUrl?.trim();
  if (canonicalUrl != null && canonicalUrl.isNotEmpty) {
    return canonicalUrl;
  }
  return '${item.providerKey.trim()}:${item.title.trim()}';
}

class _TopPostsHeader extends StatelessWidget {
  const _TopPostsHeader({
    required this.board,
    required this.sort,
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
        if (board == _TopPostBoard.posts) ...[
          Text(
            'Sort by',
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
          _TopPostSortMenu(sort: sort, onSortChanged: onSortChanged),
          if (providerKeys.isNotEmpty)
            _TopPostFilterMenu(
              providerKeys: providerKeys,
              hiddenProviders: hiddenProviders,
              onProviderToggled: onProviderToggled,
            ),
        ],
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
          postCount: postCount,
          githubTrendingCount: githubTrendingCount,
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

bool _isGithubTrendingTopRead(TopRead item) =>
    item.providerKey.trim().toLowerCase() == _githubTrendingProviderKey;

_TopPostBoard _availableTopPostBoard(
  Iterable<TopRead> items, {
  _TopPostBoard? preferred,
}) {
  var hasPosts = false;
  var hasGitHubTrending = false;
  for (final item in items) {
    if (_isGithubTrendingTopRead(item)) {
      hasGitHubTrending = true;
    } else {
      hasPosts = true;
    }
  }

  if (preferred == _TopPostBoard.posts && hasPosts) {
    return _TopPostBoard.posts;
  }
  if (preferred == _TopPostBoard.githubTrending && hasGitHubTrending) {
    return _TopPostBoard.githubTrending;
  }
  if (hasPosts) {
    return _TopPostBoard.posts;
  }
  if (hasGitHubTrending) {
    return _TopPostBoard.githubTrending;
  }
  return preferred ?? _TopPostBoard.githubTrending;
}

String _topPostDateLabel(TopRead item, SummaryPeriod fallbackPeriod) {
  final publishedAt = item.publishedAt;
  if (publishedAt == null) {
    return summaryPeriodDayLabel(fallbackPeriod);
  }

  return summaryPublishedDayLabel(publishedAt);
}

String _topPostBoardSubtitle(
  _TopPostBoard board, {
  required int curatedTopPostCount,
  required int selectedPostCount,
}) {
  return switch (board) {
    _TopPostBoard.posts =>
      curatedTopPostCount == 1
          ? '1 editorial pick from $selectedPostCount selected'
          : '$curatedTopPostCount editorial picks from '
                '$selectedPostCount selected',
    _TopPostBoard.githubTrending =>
      'Top 10 repositories in GitHub Trending order',
  };
}
