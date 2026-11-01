import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/top_posts_sort_order.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

import 'top_posts_sort_test_fixtures.dart';
import 'top_posts_test_fixtures.dart';

/// An explicitly synthetic surface for widget and Marionette workflow checks.
class TopPostsShowMoreTestApp extends StatefulWidget {
  const TopPostsShowMoreTestApp({
    super.key,
    this.sliver = true,
    this.builder,
    this.onSort,
  });
  final bool sliver;
  final (ReaderSummary, TopPostsSortOrder) Function(StateSetter)? builder;
  final ValueChanged<TopPostsSortOrder>? onSort;
  @override
  State<TopPostsShowMoreTestApp> createState() => _ShowMoreTestAppState();
}

class _ShowMoreTestAppState extends State<TopPostsShowMoreTestApp> {
  final _summary = showMoreSummaryFixture();
  TopPostsSortOrder _order = TopPostsSortOrder.modelRank;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, setState) {
              final (summary, order) =
                  widget.builder?.call(setState) ?? (_summary, _order);
              void onSort(TopPostsSortOrder value) {
                final callback = widget.onSort;
                if (callback != null) {
                  callback(value);
                } else {
                  setState(() => _order = value);
                }
              }

              final projection = readerSummaryTopPostsProjection(summary);
              final ranked = widget.sliver
                  ? ReaderSummaryTopPostsSliver(
                      projection: projection,
                      selectedPostCount: 25,
                      period: summary.period,
                      citationsById: const {},
                      ratingFor: null,
                      onRated: null,
                      onOpenUrl: (_) {},
                      sortOrder: order,
                      onSortOrderChanged: onSort,
                    )
                  : SliverToBoxAdapter(
                      child: ReaderSummaryTopPosts(
                        projection: projection,
                        selectedPostCount: 25,
                        period: summary.period,
                        citationsById: const {},
                        ratingFor: null,
                        onRated: null,
                        onOpenUrl: (_) {},
                        sortOrder: order,
                        onSortOrderChanged: onSort,
                      ),
                    );
              return CustomScrollView(
                slivers: [
                  const SliverToBoxAdapter(
                    child: Text('Synthetic UI test data'),
                  ),
                  ranked,
                  ReaderSummaryNewsWithoutRatingSliver(
                    posts: projection.newsWithoutRatingPosts,
                    period: summary.period,
                    citationsById: const {},
                    ratingFor: null,
                    onRated: null,
                    onOpenUrl: (_) {},
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

/// Twelve ranked Top cards, six more ranked cards and seven separate news cards.
ReaderSummary showMoreSummaryFixture() => topPostsSummaryFixture(
  topReads: [
    for (var i = 0; i < 12; i++)
      engagementTopPost('top-$i', engagement: (12 - i).toDouble()),
  ],
  selectedPosts: [
    for (var i = 0; i < 6; i++)
      engagementTopPost(
        'extra-$i',
        engagement: (100 + i).toDouble(),
        placement: ReaderPostPromotionPlacement.additional,
      ),
  ],
  newsWithoutRatingPosts: [
    for (var i = 0; i < 7; i++)
      engagementTopPost(
        'news-$i',
        placement: ReaderPostPromotionPlacement.news,
      ),
  ],
);
