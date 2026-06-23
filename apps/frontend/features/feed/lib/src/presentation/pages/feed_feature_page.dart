import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/feed_mention.dart';
import '../../domain/value_objects/mention_sentiment.dart';
import '../../domain/value_objects/mention_triage_state.dart';
import '../stores/feed_review_store.dart';

class FeedFeaturePage extends StatefulWidget {
  const FeedFeaturePage({super.key, required this.store, this.autoload = true});

  final FeedReviewStore store;
  final bool autoload;

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
          return CustomScrollView(
            slivers: [
              const SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Review',
                  title: 'Mentions feed',
                  description:
                      'Review mentions, preserve provenance and triage signals without storing raw provider payloads.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: AppFilterBar(
                    searchValue: widget.store.filter.search,
                    placeholder: 'Search mentions',
                    onSearchChanged: (value) {
                      unawaited(widget.store.updateSearch(value));
                    },
                    filters: [
                      AppFilterChipData(
                        label: 'Needs triage',
                        selected:
                            widget.store.filter.triageState ==
                            MentionTriageState.needsTriage,
                        onSelected: (selected) {
                          unawaited(
                            widget.store.updateTriageFilter(
                              selected ? MentionTriageState.needsTriage : null,
                            ),
                          );
                        },
                      ),
                      AppFilterChipData(
                        label: 'Reviewed',
                        selected:
                            widget.store.filter.triageState ==
                            MentionTriageState.reviewed,
                        onSelected: (selected) {
                          unawaited(
                            widget.store.updateTriageFilter(
                              selected ? MentionTriageState.reviewed : null,
                            ),
                          );
                        },
                      ),
                    ],
                    onClear: () {
                      unawaited(widget.store.updateSearch(''));
                      unawaited(widget.store.updateTriageFilter(null));
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _FeedBody(store: widget.store),
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
  const _FeedBody({required this.store});

  final FeedReviewStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final items = switch (state) {
      ReadyViewState<PageResult<FeedMention>>(:final value) => value.items,
      LoadingViewState<PageResult<FeedMention>>(:final previousValue) =>
        previousValue?.items ?? const <FeedMention>[],
      _ => const <FeedMention>[],
    };
    final isCompact = AppScreenClass.of(context).isCompact;
    final selected = store.selectedMention ?? items.firstOrNull;
    final detailMention = isCompact && !store.hasExplicitSelection
        ? null
        : selected;

    return switch (state) {
      FailureViewState<PageResult<FeedMention>>(:final failure) =>
        AppInlineProblem(
          title: 'Feed unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.refresh()),
        ),
      EmptyViewState<PageResult<FeedMention>>() => const AppInlineProblem(
        title: 'No mentions',
        message: 'Adjust filters or wait for the next collection run.',
        tone: AppProblemTone.neutral,
      ),
      _ => AppResponsiveSplitView(
        list: AppDataList<FeedMention>(
          items: items,
          stableId: (mention) => mention.id.value,
          isLoading: state is LoadingViewState<PageResult<FeedMention>>,
          isStale:
              state is ReadyViewState<PageResult<FeedMention>> && state.isStale,
          emptyTitle: 'No mentions',
          emptyMessage: 'Adjust filters or wait for the next collection run.',
          footer: AppPaginationControls(
            hasMore: store.nextCursor != null,
            isLoading: state is LoadingViewState<PageResult<FeedMention>>,
            summary: '${items.length} mentions loaded',
            onLoadMore: store.nextCursor == null
                ? null
                : () => unawaited(store.loadMore()),
          ),
          itemBuilder: (context, mention, index) {
            return ListTile(
              selected: detailMention?.id == mention.id,
              leading: const Icon(Icons.forum_outlined),
              title: Text(mention.title),
              subtitle: Text(mention.sourceName),
              trailing: AppStatusBadge(
                label: _sentimentLabel(mention.sentiment),
              ),
              onTap: () => store.selectMention(mention.id),
            );
          },
        ),
        detailTitle: detailMention?.title ?? 'Mention detail',
        onCloseDetail: isCompact ? store.clearSelection : null,
        detail: detailMention == null
            ? isCompact
                  ? null
                  : const AppInlineProblem(
                      title: 'Select a mention',
                      message: 'Choose a mention to review safe evidence.',
                      tone: AppProblemTone.neutral,
                    )
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppEntityHeader(
                    title: detailMention.title,
                    subtitle:
                        'Provider content is rendered as safe preview text.',
                    status: AppStatusBadge(
                      label: _triageLabel(detailMention.triageState),
                      tone:
                          detailMention.triageState ==
                              MentionTriageState.needsTriage
                          ? AppStatusTone.warning
                          : AppStatusTone.success,
                    ),
                    metadata: [
                      AppEntityMetadata(
                        label: 'Source',
                        value: detailMention.sourceName,
                      ),
                      AppEntityMetadata(
                        label: 'Provenance',
                        value: detailMention.provenanceLabel,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppInlineProblem(
                    title: 'Safe evidence preview',
                    message: detailMention.safeEvidencePreview,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Mark reviewed',
                        icon: Icons.check_circle_outline,
                        onPressed:
                            store.triageIntentFor(detailMention).isEnabled
                            ? () => unawaited(store.markReviewed(detailMention))
                            : null,
                      ),
                      AppCommandAction(
                        label: 'Create summary',
                        icon: Icons.summarize_outlined,
                        variant: AppButtonVariant.secondary,
                        onPressed: () {},
                      ),
                    ],
                  ),
                ],
              ),
      ),
    };
  }
}

String _sentimentLabel(MentionSentiment sentiment) {
  return switch (sentiment) {
    MentionSentiment.watch => 'Watch',
    MentionSentiment.positive => 'Positive',
    MentionSentiment.opportunity => 'Opportunity',
    MentionSentiment.unknown => 'Unknown',
  };
}

String _triageLabel(MentionTriageState state) {
  return switch (state) {
    MentionTriageState.needsTriage => 'Needs triage',
    MentionTriageState.reviewed => 'Reviewed',
    MentionTriageState.escalated => 'Escalated',
    MentionTriageState.unknown => 'Unknown',
  };
}
