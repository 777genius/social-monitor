part of 'reader_summary_brief_surface.dart';

/// Right rail of the executive summary board: selected evidence mix and
/// collection stats.
class ReaderSummaryInsightRail extends StatelessWidget {
  const ReaderSummaryInsightRail({super.key, required this.summary});

  final ReaderSummary summary;

  @override
  Widget build(BuildContext context) {
    final rows = _providerCoverageRows(summary);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (rows.isNotEmpty) ...[
          _CoverageBySourceSection(rows: rows),
          const SizedBox(height: AppSpacing.lg),
        ],
        _CollectionStatsSection(summary: summary),
      ],
    );
  }
}

class _RailSectionLabel extends StatelessWidget {
  const _RailSectionLabel({required this.label, this.infoTooltip});

  final String label;
  final String? infoTooltip;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final tooltip = infoTooltip;
    return Row(
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        if (tooltip != null) ...[
          const SizedBox(width: AppSpacing.xs + 2),
          Tooltip(
            message: tooltip,
            waitDuration: const Duration(milliseconds: 250),
            child: Icon(
              Icons.info_outline_rounded,
              size: 14,
              color: colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
            ),
          ),
        ],
      ],
    );
  }
}

class _CoverageBySourceSection extends StatelessWidget {
  const _CoverageBySourceSection({required this.rows});

  final List<_ProviderCoverageRowData> rows;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final maxCollectedCount = rows.fold<int>(
      1,
      (max, row) => row.scaleCount > max ? row.scaleCount : max,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _RailSectionLabel(
          label: 'Coverage by source',
          infoTooltip:
              'Collected is everything gathered for the period. Selected is evidence used for this summary. Top reads are the items surfaced below.',
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          'Collected posts and selected evidence used in this summary.',
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        for (final row in rows)
          _ProviderCoverageRow(row: row, maxCollectedCount: maxCollectedCount),
      ],
    );
  }
}

class _ProviderCoverageRow extends StatelessWidget {
  const _ProviderCoverageRow({
    required this.row,
    required this.maxCollectedCount,
  });

  final _ProviderCoverageRowData row;
  final int maxCollectedCount;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 1),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              ReaderSummaryProviderLogo(providerKey: row.providerKey, size: 16),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  readerSummaryProviderLabel(row.providerKey),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: textTheme.labelSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                row.primaryCountText,
                style: textTheme.labelSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            row.detailText,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          _ProviderCoverageBar(
            color: row.color,
            selectedCount: row.selectedFeedItemCount,
            collectedScaleCount: row.scaleCount,
            maxCollectedCount: maxCollectedCount,
          ),
        ],
      ),
    );
  }
}

class _ProviderCoverageBar extends StatelessWidget {
  const _ProviderCoverageBar({
    required this.color,
    required this.selectedCount,
    required this.collectedScaleCount,
    required this.maxCollectedCount,
  });

  final Color color;
  final int selectedCount;
  final int collectedScaleCount;
  final int maxCollectedCount;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final collectedRatio = (collectedScaleCount / maxCollectedCount).clamp(
      0.0,
      1.0,
    );
    final selectedRatio = (selectedCount / maxCollectedCount).clamp(0.0, 1.0);

    return SizedBox(
      height: 8,
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colorScheme.outlineVariant.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(999),
              ),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FractionallySizedBox(
              widthFactor: collectedRatio,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: color.withValues(
                    alpha: Theme.of(context).brightness == Brightness.dark
                        ? 0.28
                        : 0.18,
                  ),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
          ),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: FractionallySizedBox(
              widthFactor: selectedRatio,
              heightFactor: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(999),
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.18),
                      blurRadius: 3,
                      offset: const Offset(0, 1),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CollectionStatsSection extends StatelessWidget {
  const _CollectionStatsSection({required this.summary});

  final ReaderSummary summary;

  @override
  Widget build(BuildContext context) {
    final content = summary.content;
    final coverage = summary.coverage;
    final postCount =
        coverage?.collectedFeedItemCount ??
        coverage?.selectedFeedItemCount ??
        content.sourceMix.fold<int>(0, (sum, entry) => sum + entry.itemCount);
    final citationCount = coverage?.citationCount ?? summary.citations.length;
    final topReadCount = coverage?.topReadCount ?? content.topReads.length;
    final providerCount = coverage?.providerBreakdown.isNotEmpty ?? false
        ? coverage!.providerBreakdown.length
        : content.sourceMix.length;
    final stats = [
      (formatCompactCount(postCount), 'Posts'),
      (formatCompactCount(citationCount), 'Citations'),
      (formatCompactCount(topReadCount), 'Top reads'),
      (formatCompactCount(providerCount), 'Sources'),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _RailSectionLabel(label: 'Collection stats'),
        const SizedBox(height: AppSpacing.sm + 4),
        Row(
          children: [
            for (final stat in stats)
              Expanded(
                child: _StatTile(value: stat.$1, label: stat.$2),
              ),
          ],
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.value, required this.label});

  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          value,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
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
