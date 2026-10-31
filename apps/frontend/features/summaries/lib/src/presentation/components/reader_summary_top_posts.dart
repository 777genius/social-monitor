part of 'reader_summary_brief_surface.dart';

enum _TopPostBoard { topPosts, additionalStories }

/// "Top posts" board: filterable picks in the backend-attested order, or in
/// the reader-chosen [sortOrder] within each lane.
class ReaderSummaryTopPosts extends StatefulWidget {
  const ReaderSummaryTopPosts({
    super.key,
    required this.projection,
    required this.selectedPostCount,
    required this.period,
    required this.citationsById,
    required this.ratingFor,
    required this.onRated,
    required this.onOpenUrl,
    this.sortOrder = TopPostsSortOrder.modelRank,
    this.onSortOrderChanged,
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
  final TopPostsSortOrder sortOrder;

  /// `null` hides the order control.
  final ValueChanged<TopPostsSortOrder>? onSortOrderChanged;

  @override
  State<ReaderSummaryTopPosts> createState() => _ReaderSummaryTopPostsState();
}

class _ReaderSummaryTopPostsState extends State<ReaderSummaryTopPosts> {
  late _TopPostBoard _board;
  final Set<String> _hiddenProviders = {};
  final ScrollController _postsScrollController = ScrollController();
  bool _denseView = false;

  @override
  void initState() {
    super.initState();
    _board = _availableTopPostBoard(widget.projection);
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPosts oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.projection.hasSameDatasetAs(oldWidget.projection)) {
      _board = _availableTopPostBoard(widget.projection, preferred: _board);
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
    final topPostItems = widget.projection.curatedPosts;
    final additionalStories = widget.projection.additionalNotableStories;
    final activeBoard = _board;
    final boardItems = switch (activeBoard) {
      _TopPostBoard.topPosts => topPostItems,
      _TopPostBoard.additionalStories => additionalStories,
    };
    final filtered = readerSummaryTopPostsInOrder(boardItems, widget.sortOrder)
        .where((item) => !_hiddenProviders.contains(item.providerKey))
        .toList(growable: false);
    final rowKeys = [for (final item in filtered) _topPostRowKey(item)];
    final rowIndexByKey = {
      for (final (index, key) in rowKeys.indexed) key: index,
    };
    final reservePreviewSpace = filtered.any(
      (item) => item.previewMedia != null,
    );
    final listHeight = _topPostsListViewportHeight(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _TopPostsHeader(
          board: activeBoard,
          topPostCount: topPostItems.length,
          additionalStoryCount: additionalStories.length,
          curatedTopPostCount: widget.projection.curatedPosts.length,
          selectedPostCount: widget.selectedPostCount,
          providerKeys: {
            for (final item in boardItems) item.providerKey,
          }.toList(growable: false),
          hiddenProviders: _hiddenProviders,
          denseView: _denseView,
          sortOrder: widget.sortOrder,
          onBoardChanged: _setBoard,
          onProviderToggled: _toggleProvider,
          onDenseViewChanged: _setDenseView,
          onSortOrderChanged: widget.onSortOrderChanged == null
              ? null
              : _setSortOrder,
        ),
        const SizedBox(height: AppSpacing.sm),
        if (filtered.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: Text(
              activeBoard == _TopPostBoard.additionalStories
                  ? 'No additional stories qualified in this summary window.'
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
                findItemIndexCallback: (key) => rowIndexByKey[key],
                separatorBuilder: (context, index) =>
                    Divider(height: 1, color: colorScheme.outlineVariant),
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  return _TopPostRow(
                    key: rowKeys[index],
                    index: index,
                    item: item,
                    dateLabel: _topPostDateLabel(item, widget.period),
                    citationsById: widget.citationsById,
                    dense: _denseView,
                    reservePreviewSpace: reservePreviewSpace,
                    // Both ranked lanes carry the backend Signal.
                    showSignal: true,
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

  void _setSortOrder(TopPostsSortOrder order) {
    widget.onSortOrderChanged?.call(order);
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

_TopPostBoard _availableTopPostBoard(
  ReaderSummaryTopPostsProjection projection, {
  _TopPostBoard? preferred,
}) {
  final hasTopPosts = projection.curatedPosts.isNotEmpty;
  final hasAdditionalStories = projection.additionalNotableStories.isNotEmpty;

  if (preferred == _TopPostBoard.topPosts && hasTopPosts) {
    return _TopPostBoard.topPosts;
  }
  if (preferred == _TopPostBoard.additionalStories && hasAdditionalStories) {
    return _TopPostBoard.additionalStories;
  }
  if (hasTopPosts) {
    return _TopPostBoard.topPosts;
  }
  if (hasAdditionalStories) {
    return _TopPostBoard.additionalStories;
  }
  return preferred ?? _TopPostBoard.topPosts;
}

String _topPostDateLabel(TopRead item, SummaryPeriod fallbackPeriod) {
  final publishedAt = item.publishedAt;
  if (publishedAt == null) {
    return summaryPeriodDayLabel(fallbackPeriod);
  }

  return summaryPublishedDayLabel(publishedAt);
}
