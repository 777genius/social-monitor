import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../formatters/top_post_metrics.dart';

class ReaderSummaryCollectionStats extends StatelessWidget {
  const ReaderSummaryCollectionStats({
    super.key,
    required this.summary,
    this.showHeading = true,
    this.compact = false,
  });

  final ReaderSummary summary;
  final bool showHeading;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final stats = readerSummaryCollectionStats(summary);
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showHeading) ...[
          Text(
            'Collection stats',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.sm + 4),
        ],
        if (compact)
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: _CollectionStatsRow(stats: stats, compact: true),
          )
        else
          _CollectionStatsRow(stats: stats, compact: false),
      ],
    );
  }
}

class _CollectionStatsRow extends StatelessWidget {
  const _CollectionStatsRow({required this.stats, required this.compact});

  final List<ReaderSummaryCollectionStat> stats;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final tileWidth = compact ? 58.0 : 68.0;
    final spacing = compact ? AppSpacing.sm + 4 : AppSpacing.lg;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (final indexed in stats.indexed) ...[
          SizedBox(
            width: tileWidth,
            child: _CollectionStatTile(
              key: ValueKey('reader-summary-stat-${indexed.$2.label}'),
              value: indexed.$2.value,
              label: indexed.$2.label,
              compact: compact,
            ),
          ),
          if (indexed.$1 != stats.length - 1) SizedBox(width: spacing),
        ],
      ],
    );
  }
}

List<ReaderSummaryCollectionStat> readerSummaryCollectionStats(
  ReaderSummary summary,
) {
  final content = summary.content;
  final coverage = summary.coverage;
  final postCount = _collectionPostCount(content: content, coverage: coverage);
  final citationCount = coverage?.citationCount ?? summary.citations.length;
  final topReadCount = coverage?.topReadCount ?? content.topReads.length;
  final providerCount = coverage?.providerBreakdown.isNotEmpty ?? false
      ? coverage!.providerBreakdown.length
      : content.sourceMix.length;

  return [
    ReaderSummaryCollectionStat(formatCompactCount(postCount), 'Posts'),
    ReaderSummaryCollectionStat(formatCompactCount(citationCount), 'Citations'),
    ReaderSummaryCollectionStat(formatCompactCount(topReadCount), 'Top reads'),
    ReaderSummaryCollectionStat(formatCompactCount(providerCount), 'Sources'),
  ];
}

final class ReaderSummaryCollectionStat {
  const ReaderSummaryCollectionStat(this.value, this.label);

  final String value;
  final String label;
}

int _collectionPostCount({
  required ReaderSummaryContent content,
  required ReaderSummaryCoverage? coverage,
}) {
  final selectedCount = coverage?.selectedFeedItemCount ?? 0;
  final sourceMixCount = content.sourceMix.fold<int>(
    0,
    (sum, entry) => sum + entry.itemCount,
  );
  final providerSelectedCount =
      coverage?.providerBreakdown.fold<int>(
        0,
        (sum, provider) => sum + provider.selectedFeedItemCount,
      ) ??
      0;
  final selectedEvidenceCount = [
    selectedCount,
    sourceMixCount,
    providerSelectedCount,
    content.topReads.length,
  ].fold<int>(0, (max, value) => value > max ? value : max);
  final collectedCount = coverage?.collectedFeedItemCount;

  if (collectedCount == null) {
    return selectedEvidenceCount;
  }

  return collectedCount > selectedEvidenceCount
      ? collectedCount
      : selectedEvidenceCount;
}

class _CollectionStatTile extends StatelessWidget {
  const _CollectionStatTile({
    super.key,
    required this.value,
    required this.label,
    required this.compact,
  });

  final String value;
  final String label;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: (compact ? textTheme.labelLarge : textTheme.titleMedium)
              ?.copyWith(fontWeight: FontWeight.w800, letterSpacing: 0),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}
