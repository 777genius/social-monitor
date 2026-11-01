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

  /// Reader-chosen order across all currently visible ranked cards.
  final TopPostsSortOrder sortOrder;

  /// `null` hides the order control.
  final ValueChanged<TopPostsSortOrder>? onSortOrderChanged;

  @override
  State<ReaderSummaryTopPostsSliver> createState() =>
      _ReaderSummaryTopPostsSliverState();
}

class _ReaderSummaryTopPostsSliverState
    extends State<ReaderSummaryTopPostsSliver> {
  bool _expanded = false;
  late ReaderSummaryRankedPostsDisplay _display;
  late List<TopRead> _filteredItems;
  late List<ValueKey<String>> _rowKeys;
  late Map<Key, int> _rowIndexByKey;
  late List<String> _providerKeys;
  late bool _reservePreviewSpace;
  final Set<String> _hiddenProviders = {};
  bool _denseView = false;

  @override
  void initState() {
    super.initState();
    _refreshBoardItems();
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPostsSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    final datasetChanged = !widget.projection.hasSameDatasetAs(
      oldWidget.projection,
    );
    final periodChanged = widget.period != oldWidget.period;
    final sortChanged = widget.sortOrder != oldWidget.sortOrder;
    if (!datasetChanged && !periodChanged && !sortChanged) return;
    if (datasetChanged || periodChanged) {
      _expanded = false;
    }
    _refreshBoardItems();
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final filtered = _filteredItems;
    final sliverItemCount = math.max(0, filtered.length * 2 - 1);

    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _TopPostsHeader(
            visibleCount: filtered.length,
            availableCount: _display.availableCount,
            providerKeys: _providerKeys,
            hiddenProviders: _hiddenProviders,
            denseView: _denseView,
            sortOrder: widget.sortOrder,
            onProviderToggled: _toggleProvider,
            onDenseViewChanged: _setDenseView,
            onSortOrderChanged: widget.onSortOrderChanged,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        if (filtered.isEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
              child: Text(
                _display.remainingCount > 0
                    ? 'No top posts match these source filters. Use Show more to view the remaining ranked posts.'
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
            // Rows follow their card when the order or filters move it.
            findChildIndexCallback: (key) => switch (_rowIndexByKey[key]) {
              final itemIndex? => itemIndex * 2,
              null => null,
            },
            itemBuilder: (context, index) {
              if (index.isOdd) {
                return Divider(height: 1, color: colorScheme.outlineVariant);
              }

              final itemIndex = index ~/ 2;
              final item = filtered[itemIndex];
              return _TopPostRow(
                key: _rowKeys[itemIndex],
                index: itemIndex,
                item: item,
                dateLabel: _topPostDateLabel(item, widget.period),
                citationsById: widget.citationsById,
                dense: _denseView,
                reservePreviewSpace: _reservePreviewSpace,
                // Both ranked lanes carry the backend Signal.
                showSignal: true,
                rating: widget.ratingFor?.call(item),
                onRated: widget.onRated,
                onOpenUrl: widget.onOpenUrl,
              );
            },
          ),
        if (_display.showRevealControl)
          SliverToBoxAdapter(
            child: _TopPostsShowMore(
              expanded: _expanded,
              remainingCount: _display.remainingCount,
              onPressed: _toggleExpanded,
            ),
          ),
      ],
    );
  }

  void _toggleExpanded() {
    setState(() {
      _expanded = !_expanded;
      _refreshBoardItems();
    });
  }

  void _toggleProvider(String providerKey) {
    setState(() {
      if (!_hiddenProviders.remove(providerKey)) {
        _hiddenProviders.add(providerKey);
      }
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

  void _refreshBoardItems() {
    _display = ReaderSummaryRankedPostsDisplay(
      projection: widget.projection,
      expanded: _expanded,
      sortOrder: widget.sortOrder,
      hiddenProviders: _hiddenProviders,
    );
    _providerKeys = _display.providerKeys;
    _filteredItems = _display.items;
    _rowKeys = [for (final item in _filteredItems) _topPostRowKey(item)];
    _rowIndexByKey = {for (final (index, key) in _rowKeys.indexed) key: index};
    _reservePreviewSpace = _filteredItems.any(
      (item) => item.previewMedia != null,
    );
  }
}
