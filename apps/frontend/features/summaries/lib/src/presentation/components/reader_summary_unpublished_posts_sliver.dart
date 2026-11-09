import 'package:flutter/material.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/top_posts_sort_order.dart';
import '../stores/reader_posts_browse_store.dart';
import 'reader_summary_brief_surface.dart';

/// Collected source posts for a day without a published AI summary.
///
/// Does not use the curated promotion board or create artificial ratings.
class ReaderSummaryUnpublishedPostsSliver extends StatelessWidget {
  const ReaderSummaryUnpublishedPostsSliver({
    super.key,
    required this.store,
    required this.period,
    required this.contentPadding,
    required this.onOpenUrl,
  });

  final ReaderPostsBrowseStore store;
  final SummaryPeriod period;
  final EdgeInsets contentPadding;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) => ListenableBuilder(
    listenable: store,
    builder: (context, _) {
      store.bindUnpublishedDay(period);
      return SliverPadding(
        padding: contentPadding,
        sliver: ReaderSummaryAllPostsSliver(
          store: store,
          period: period,
          sortOrder: TopPostsSortOrder.engagement,
          onSortChanged: null,
          onOpenUrl: onOpenUrl,
          sourceOnly: true,
        ),
      );
    },
  );
}
