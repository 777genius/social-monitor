import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import 'reader_summary_brief_surface.dart';

class ReaderSummaryTopPostsSectionSliver extends StatelessWidget {
  const ReaderSummaryTopPostsSectionSliver({
    super.key,
    required this.summary,
    required this.contentPadding,
    required this.onOpenUrl,
    this.ratingFor,
    this.onRated,
  });

  final ReaderSummary summary;
  final EdgeInsets contentPadding;
  final ValueChanged<String> onOpenUrl;
  final int? Function(TopRead item)? ratingFor;
  final Future<bool> Function(
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )?
  onRated;

  @override
  Widget build(BuildContext context) {
    final items = readerSummaryTopPostItems(summary);
    if (items.isEmpty) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }
    return SliverMainAxisGroup(
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md + 2)),
        SliverPadding(
          padding: contentPadding,
          sliver: ReaderSummaryTopPostsSliver(
            items: items,
            curatedTopPostCount: summary.content.topReads.length,
            selectedPostCount:
                summary.coverage?.selectedFeedItemCount ?? items.length,
            period: summary.period,
            citationsById: {
              for (final citation in summary.citations) citation.id: citation,
            },
            ratingFor: ratingFor,
            onRated: onRated,
            onOpenUrl: onOpenUrl,
          ),
        ),
      ],
    );
  }
}

List<TopRead> readerSummaryTopPostItems(ReaderSummary summary) =>
    summary.content.selectedPosts.isNotEmpty
    ? summary.content.selectedPosts
    : summary.content.topReads;
