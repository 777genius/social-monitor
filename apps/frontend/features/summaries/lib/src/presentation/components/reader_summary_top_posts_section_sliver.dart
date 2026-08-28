import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../view_models/reader_summary_top_posts_projection.dart';
import 'reader_summary_brief_surface.dart';

class ReaderSummaryTopPostsSectionSliver extends StatefulWidget {
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
  State<ReaderSummaryTopPostsSectionSliver> createState() =>
      _ReaderSummaryTopPostsSectionSliverState();
}

class _ReaderSummaryTopPostsSectionSliverState
    extends State<ReaderSummaryTopPostsSectionSliver> {
  late ReaderSummaryTopPostsProjection _projection;

  @override
  void initState() {
    super.initState();
    _projection = readerSummaryTopPostsProjection(widget.summary);
  }

  @override
  void didUpdateWidget(covariant ReaderSummaryTopPostsSectionSliver oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(widget.summary, oldWidget.summary)) {
      _projection = readerSummaryTopPostsProjection(widget.summary);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_projection.isEmpty) {
      if (!_hasSummaryEvidence(widget.summary)) {
        return const SliverToBoxAdapter(child: SizedBox.shrink());
      }
      return SliverMainAxisGroup(
        slivers: [
          const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md + 2)),
          SliverPadding(
            padding: widget.contentPadding,
            sliver: const SliverToBoxAdapter(
              child: _UnavailableTopPostsNotice(),
            ),
          ),
        ],
      );
    }
    return SliverMainAxisGroup(
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.md + 2)),
        SliverPadding(
          padding: widget.contentPadding,
          sliver: ReaderSummaryTopPostsSliver(
            projection: _projection,
            selectedPostCount: _selectedPostCount(widget.summary),
            period: widget.summary.period,
            citationsById: {
              for (final citation in widget.summary.citations)
                citation.id: citation,
            },
            ratingFor: widget.ratingFor,
            onRated: widget.onRated,
            onOpenUrl: widget.onOpenUrl,
          ),
        ),
      ],
    );
  }
}

bool _hasSummaryEvidence(ReaderSummary summary) =>
    summary.citations.isNotEmpty ||
    (summary.coverage?.selectedFeedItemCount ?? 0) > 0;

class _UnavailableTopPostsNotice extends StatelessWidget {
  const _UnavailableTopPostsNotice();

  @override
  Widget build(BuildContext context) => Column(
    key: const ValueKey('reader-summary-top-posts-unavailable'),
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Text(
        'Top posts',
        style: Theme.of(context).textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: 0,
        ),
      ),
      const SizedBox(height: AppSpacing.sm),
      const AppInlineProblem(
        title: 'Verified Top posts unavailable',
        message:
            'This summary still has its narrative and citations, but no posts '
            'have the verification required for the Top posts board.',
      ),
    ],
  );
}

int _selectedPostCount(ReaderSummary summary) {
  final coverageCount = summary.coverage?.selectedFeedItemCount;
  if (coverageCount != null) {
    return coverageCount;
  }
  final selectedPosts = summary.content.selectedPosts;
  return selectedPosts.isNotEmpty
      ? selectedPosts.length
      : summary.content.topReads.length;
}
