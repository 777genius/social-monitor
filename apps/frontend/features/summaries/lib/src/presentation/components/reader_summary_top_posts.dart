part of 'reader_summary_brief_surface.dart';

enum _TopPostBoard { topPosts, additionalStories }

/// "Top posts" board: filterable picks in the backend-attested order.
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
    final filtered = boardItems
        .where((item) => !_hiddenProviders.contains(item.providerKey))
        .toList(growable: false);
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
          onBoardChanged: _setBoard,
          onProviderToggled: _toggleProvider,
          onDenseViewChanged: _setDenseView,
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
                separatorBuilder: (context, index) =>
                    Divider(height: 1, color: colorScheme.outlineVariant),
                itemBuilder: (context, index) {
                  final item = filtered[index];
                  return _TopPostRow(
                    key: ValueKey(
                      'reader-summary-top-post-'
                      '${readerSummaryTopPostIdentity(item)}',
                    ),
                    index: index,
                    item: item,
                    dateLabel: _topPostDateLabel(item, widget.period),
                    citationsById: widget.citationsById,
                    dense: _denseView,
                    reservePreviewSpace: reservePreviewSpace,
                    showSignal: activeBoard != _TopPostBoard.additionalStories,
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
    required this.onBoardChanged,
    required this.onProviderToggled,
    required this.onDenseViewChanged,
  });

  final _TopPostBoard board;
  final int topPostCount;
  final int additionalStoryCount;
  final int curatedTopPostCount;
  final int selectedPostCount;
  final List<String> providerKeys;
  final Set<String> hiddenProviders;
  final bool denseView;
  final ValueChanged<_TopPostBoard> onBoardChanged;
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
