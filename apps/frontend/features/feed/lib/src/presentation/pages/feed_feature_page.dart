import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_item.dart';
import '../components/feed_item_card.dart';
import '../components/feed_item_detail_panel.dart';
import '../components/feed_snapshot_panel.dart';
import '../stores/feed_items_store.dart';
import '../view_models/feed_filter_facets.dart';

class FeedFeaturePage extends StatefulWidget {
  const FeedFeaturePage({
    super.key,
    required this.store,
    this.autoload = true,
    this.interestTitle,
  });

  final FeedItemsStore store;
  final bool autoload;
  final String? interestTitle;

  @override
  State<FeedFeaturePage> createState() => _FeedFeaturePageState();
}

class _FeedFeaturePageState extends State<FeedFeaturePage> {
  @override
  void initState() {
    super.initState();
    if (widget.autoload) {
      unawaited(widget.store.refresh());
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AnimatedBuilder(
        animation: widget.store,
        builder: (context, child) {
          final interestId = widget.store.filter.interestId;
          final interestLabel = _interestLabel(
            interestId: interestId,
            interestTitle: widget.interestTitle,
          );
          final items = _itemsFromState(widget.store.state);
          final facets = buildFeedFilterFacets(
            items: items,
            filter: widget.store.filter,
          );
          return CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Feed',
                  title: 'Feed',
                  description:
                      'Collected posts, source context and summary evidence.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: AppFilterBar(
                    searchValue: widget.store.filter.search,
                    placeholder: 'Search posts',
                    onSearchChanged: (value) {
                      unawaited(widget.store.updateSearch(value));
                    },
                    filters: [
                      if (interestId != null)
                        AppFilterChipData(
                          label: interestLabel ?? 'Interest $interestId',
                          selected: true,
                          onSelected: (_) {
                            unawaited(widget.store.clearInterestFilter());
                          },
                        ),
                      for (final option in facets.providerOptions)
                        AppFilterChipData(
                          label: option.label,
                          selected: option.selected,
                          onSelected: (_) {
                            unawaited(
                              widget.store.updateProviderFilter(
                                option.selected ? null : option.value,
                              ),
                            );
                          },
                        ),
                      for (final option in facets.trendWindowOptions)
                        AppFilterChipData(
                          label: option.label,
                          selected: option.selected,
                          onSelected: (_) {
                            unawaited(
                              widget.store.updateRepositoryTrendWindowFilter(
                                option.selected ? null : option.value,
                              ),
                            );
                          },
                        ),
                      for (final option in facets.languageOptions)
                        AppFilterChipData(
                          label: option.label,
                          selected: option.selected,
                          onSelected: (_) {
                            unawaited(
                              widget.store.updateRepositoryLanguageFilter(
                                option.selected ? null : option.value,
                              ),
                            );
                          },
                        ),
                      for (final option in facets.repositoryTopicOptions)
                        AppFilterChipData(
                          label: option.label,
                          selected: option.selected,
                          onSelected: (_) {
                            unawaited(
                              widget.store.updateRepositoryTopicFilter(
                                option.selected ? null : option.value,
                              ),
                            );
                          },
                        ),
                    ],
                    onClear: widget.store.filter.hasAnyFilter
                        ? () => unawaited(widget.store.clearFilters())
                        : null,
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _FeedBody(
                    store: widget.store,
                    interestLabel: interestLabel,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _FeedBody extends StatelessWidget {
  const _FeedBody({required this.store, required this.interestLabel});

  final FeedItemsStore store;
  final String? interestLabel;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final items = switch (state) {
      ReadyViewState<PageResult<FeedItem>>(:final value) => value.items,
      LoadingViewState<PageResult<FeedItem>>(:final previousValue) =>
        previousValue?.items ?? const <FeedItem>[],
      _ => const <FeedItem>[],
    };
    final isCompact = AppScreenClass.of(context).isCompact;
    final hasAnyFilter = store.filter.hasAnyFilter;
    final nextCursor = store.nextCursor;
    final showPagination =
        nextCursor != null || state is LoadingViewState<PageResult<FeedItem>>;
    final detailState = store.detailState;
    final selected = store.selectedListItem ?? items.firstOrNull;
    final detailItem = isCompact && !store.hasExplicitSelection
        ? null
        : store.selectedDetailItem ?? selected;
    final detailFailure = switch (detailState) {
      FailureViewState<FeedItem>(:final failure) => failure,
      _ => null,
    };

    return switch (state) {
      FailureViewState<PageResult<FeedItem>>(:final failure) =>
        AppInlineProblem(
          title: 'Feed unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.refresh()),
        ),
      EmptyViewState<PageResult<FeedItem>>() => AppInlineProblem(
        title: hasAnyFilter
            ? 'No posts match these filters'
            : 'No feed items yet',
        message: hasAnyFilter
            ? 'Clear filters to return to all collected posts.'
            : 'Connect sources or wait for the next collection run.',
        tone: AppProblemTone.neutral,
        actionLabel: hasAnyFilter ? 'Clear filters' : null,
        onAction: hasAnyFilter ? () => unawaited(store.clearFilters()) : null,
      ),
      _ => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          FeedSnapshotPanel(
            items: items,
            nextCursor: nextCursor,
            interestLabel: interestLabel,
          ),
          const SizedBox(height: AppSpacing.md),
          AppResponsiveSplitView(
            list: AppDataList<FeedItem>(
              items: items,
              stableId: (item) => item.id.value,
              isLoading: state is LoadingViewState<PageResult<FeedItem>>,
              isStale:
                  state is ReadyViewState<PageResult<FeedItem>> &&
                  state.isStale,
              emptyTitle: 'No feed items',
              emptyMessage: hasAnyFilter
                  ? 'Clear filters to return to all collected posts.'
                  : 'Connect sources or wait for the next collection run.',
              footer: showPagination
                  ? AppPaginationControls(
                      hasMore: nextCursor != null,
                      isLoading:
                          state is LoadingViewState<PageResult<FeedItem>>,
                      summary: '${items.length} posts shown',
                      onLoadMore: nextCursor == null
                          ? null
                          : () => unawaited(store.loadMore()),
                    )
                  : null,
              itemBuilder: (context, item, index) {
                return FeedItemCard(
                  key: ValueKey('feed-item-card-${item.id.value}'),
                  item: item,
                  selected: detailItem?.id == item.id,
                  onTap: () => unawaited(store.selectItem(item.id)),
                );
              },
            ),
            detailTitle: detailItem?.title ?? 'Feed item detail',
            onCloseDetail: isCompact ? store.clearSelection : null,
            detail: detailItem == null
                ? isCompact
                      ? null
                      : const AppInlineProblem(
                          title: 'Select a feed item',
                          message: 'Choose an item to inspect its provenance.',
                          tone: AppProblemTone.neutral,
                        )
                : FeedItemDetailPanel(
                    item: detailItem,
                    isLoading: detailState is LoadingViewState<FeedItem>,
                    failure: detailFailure,
                  ),
          ),
        ],
      ),
    };
  }
}

String? _interestLabel({
  required String? interestId,
  required String? interestTitle,
}) {
  if (interestId == null) {
    return null;
  }
  final normalizedTitle = interestTitle?.trim();
  if (normalizedTitle != null && normalizedTitle.isNotEmpty) {
    return normalizedTitle;
  }
  return 'Interest $interestId';
}

List<FeedItem> _itemsFromState(AsyncViewState<PageResult<FeedItem>> state) {
  return switch (state) {
    ReadyViewState<PageResult<FeedItem>>(:final value) => value.items,
    LoadingViewState<PageResult<FeedItem>>(:final previousValue) =>
      previousValue?.items ?? const <FeedItem>[],
    _ => const <FeedItem>[],
  };
}
