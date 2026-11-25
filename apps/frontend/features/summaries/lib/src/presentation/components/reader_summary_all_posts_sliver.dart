part of 'reader_summary_brief_surface.dart';

/// Reuses the source-card renderer without granting editorial authorization.
class ReaderSummaryAllPostsSliver extends StatefulWidget {
  const ReaderSummaryAllPostsSliver({
    super.key,
    required this.store,
    required this.period,
    required this.sortOrder,
    required this.onSortChanged,
    required this.onOpenUrl,
    this.sourceOnly = false,
  });

  final ReaderPostsBrowseStore store;
  final SummaryPeriod period;
  final TopPostsSortOrder sortOrder;
  final ValueChanged<TopPostsSortOrder>? onSortChanged;
  final ValueChanged<String> onOpenUrl;
  final bool sourceOnly;

  @override
  State<ReaderSummaryAllPostsSliver> createState() =>
      _ReaderSummaryAllPostsSliverState();
}

class _ReaderSummaryAllPostsSliverState
    extends State<ReaderSummaryAllPostsSliver> {
  bool _dense = false;

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final state = store.state;
    final page = switch (state) {
      ReadyViewState<ReaderPostsPage>(:final value) => value,
      LoadingViewState<ReaderPostsPage>(:final previousValue) => previousValue,
      _ => null,
    };
    final items = page?.items ?? const <TopRead>[];
    final busy = state is LoadingViewState<ReaderPostsPage>;
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _TopPostsHeader(
            visibleCount: items.length,
            availableCount: page?.total ?? 0,
            providerKeys: page?.providerKeys ?? const [],
            hiddenProviders: store.hiddenProviders,
            denseView: _dense,
            sortOrder: widget.sortOrder,
            onProviderToggled: store.toggleProvider,
            onDenseViewChanged: (value) => setState(() => _dense = value),
            onSortOrderChanged: widget.onSortChanged,
            selectedOnly: false,
            onSelectedOnlyChanged: widget.sourceOnly ? null : store.selectOnly,
            titleOverride: widget.sourceOnly ? 'Top posts by likes' : null,
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        if (state case FailureViewState<ReaderPostsPage>())
          SliverToBoxAdapter(
            child: AppInlineProblem(
              title: 'Posts unavailable',
              message:
                  'The list could not be loaded or changed while you were browsing. Reload to continue.',
              actionLabel: 'Reload',
              onAction: () => unawaited(store.reload()),
            ),
          )
        else if (items.isEmpty && !busy)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.lg),
              child: Text('No posts match this period and source filters.'),
            ),
          ),
        SliverList.builder(
          itemCount: math.max(0, items.length * 2 - 1),
          itemBuilder: (context, index) {
            if (index.isOdd) return const Divider(height: 1);
            final item = items[index ~/ 2];
            return Column(
              key: _topPostRowKey(item),
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (!widget.sourceOnly)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.sm),
                    child: Text(
                      item.reason,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ),
                _TopPostRow(
                  index: index ~/ 2,
                  item: item,
                  dateLabel: _topPostDateLabel(item, widget.period),
                  citationsById: const {},
                  rating: null,
                  onRated: null,
                  onOpenUrl: widget.onOpenUrl,
                  dense: _dense,
                  showSignal: false,
                  sourceOnly: widget.sourceOnly,
                ),
              ],
            );
          },
        ),
        if (items.length > 12)
          SliverToBoxAdapter(
            child: Center(
              child: AppButton(
                key: const ValueKey('reader-summary-all-posts-show-less'),
                label: 'Show less',
                variant: AppButtonVariant.text,
                onPressed: store.showLess,
              ),
            ),
          ),
        if (busy)
          const SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.md),
              child: Center(child: CircularProgressIndicator()),
            ),
          )
        else if (page?.nextCursor != null)
          SliverToBoxAdapter(
            child: _TopPostsShowMore(
              expanded: false,
              remainingCount: page!.total - items.length,
              onPressed: () => unawaited(store.showMore()),
            ),
          ),
      ],
    );
  }
}
