part of 'reader_summary_brief_surface.dart';

/// "News without rating": promoted posts from sources that have no
/// popularity rating, such as RSS.
///
/// The block keeps the backend order (most useful first, then newest), is
/// built lazily from the already loaded board and reuses the Top post row.
/// It never shows a Signal: these sources have no rating, and a "Signal 0"
/// would read as a measured result.
class ReaderSummaryNewsWithoutRatingSliver extends StatelessWidget {
  const ReaderSummaryNewsWithoutRatingSliver({
    super.key,
    required this.posts,
    required this.period,
    required this.citationsById,
    required this.ratingFor,
    required this.onRated,
    required this.onOpenUrl,
  });

  final List<TopRead> posts;
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
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final reservePreviewSpace = posts.any((item) => item.previewMedia != null);
    return SliverMainAxisGroup(
      slivers: [
        SliverToBoxAdapter(
          child: _NewsWithoutRatingHeader(count: posts.length),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.sm)),
        SliverList.builder(
          itemCount: math.max(0, posts.length * 2 - 1),
          itemBuilder: (context, index) {
            if (index.isOdd) {
              return Divider(height: 1, color: colorScheme.outlineVariant);
            }
            final itemIndex = index ~/ 2;
            final item = posts[itemIndex];
            return _TopPostRow(
              key: ValueKey(
                'reader-summary-news-post-${readerSummaryTopPostIdentity(item)}',
              ),
              index: itemIndex,
              item: item,
              dateLabel: _topPostDateLabel(item, period),
              citationsById: citationsById,
              reservePreviewSpace: reservePreviewSpace,
              showSignal: false,
              rating: ratingFor?.call(item),
              onRated: onRated,
              onOpenUrl: onOpenUrl,
            );
          },
        ),
      ],
    );
  }
}

class _NewsWithoutRatingHeader extends StatelessWidget {
  const _NewsWithoutRatingHeader({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Semantics(
      key: const ValueKey('reader-summary-news-without-rating'),
      container: true,
      header: true,
      label: '$_newsWithoutRatingTitle, $count items',
      child: ExcludeSemantics(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(
                  Icons.newspaper_outlined,
                  size: 17,
                  color: colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: AppSpacing.xs + 2),
                Flexible(
                  child: Text(
                    _newsWithoutRatingTitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  '$count',
                  style: textTheme.labelSmall?.copyWith(
                    color: colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'From sources without a popularity rating, such as RSS. '
              'Most useful first, then newest.',
              style: textTheme.labelSmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
                letterSpacing: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _newsWithoutRatingTitle = 'News without rating';
