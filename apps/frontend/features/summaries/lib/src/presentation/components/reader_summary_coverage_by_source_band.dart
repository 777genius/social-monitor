part of 'reader_summary_brief_surface.dart';

class ReaderSummaryCoverageBySourceBand extends StatelessWidget {
  const ReaderSummaryCoverageBySourceBand({super.key, required this.summary});

  final ReaderSummary summary;

  static bool hasCoverage(ReaderSummary summary) {
    return _providerCoverageRows(summary).isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final rows = _providerCoverageRows(summary);
    if (rows.isEmpty) {
      return const SizedBox.shrink();
    }

    return _CoverageBySourceSection(rows: rows);
  }
}

class _CoverageBySourceSection extends StatelessWidget {
  const _CoverageBySourceSection({required this.rows});

  final List<_ProviderCoverageRowData> rows;

  @override
  Widget build(BuildContext context) {
    final maxCollectedCount = rows.fold<int>(
      1,
      (max, row) => row.scaleCount > max ? row.scaleCount : max,
    );

    return Column(
      key: const ValueKey('reader-summary-coverage-by-source'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _ProviderCoverageRowsWrap(
          rows: rows,
          maxCollectedCount: maxCollectedCount,
        ),
      ],
    );
  }
}

class _ProviderCoverageRowsWrap extends StatelessWidget {
  const _ProviderCoverageRowsWrap({
    required this.rows,
    required this.maxCollectedCount,
  });

  static const _minWideTileWidth = 180.0;
  static const _singleColumnMaxWidth = 520.0;

  final List<_ProviderCoverageRowData> rows;
  final int maxCollectedCount;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final availableWidth = constraints.maxWidth;
        final columnCount = _columnCountFor(availableWidth, rows.length);
        final itemSpacing = AppSpacing.md;
        final totalSpacing = itemSpacing * (columnCount - 1);
        final itemWidth = availableWidth.isFinite
            ? (availableWidth - totalSpacing) / columnCount
            : _minWideTileWidth;

        return Wrap(
          spacing: itemSpacing,
          runSpacing: AppSpacing.sm,
          children: [
            for (final row in rows)
              SizedBox(
                width: itemWidth,
                child: _ProviderCoverageRow(
                  key: ValueKey(
                    'reader-summary-provider-coverage-${row.providerKey}',
                  ),
                  row: row,
                  maxCollectedCount: maxCollectedCount,
                ),
              ),
          ],
        );
      },
    );
  }

  static int _columnCountFor(double availableWidth, int rowCount) {
    if (rowCount <= 1 || !availableWidth.isFinite) {
      return math.max(rowCount, 1);
    }
    if (availableWidth < _singleColumnMaxWidth) {
      return 1;
    }

    final columnsByWidth = (availableWidth / _minWideTileWidth).floor();
    return math.min(rowCount, math.max(columnsByWidth, 1));
  }
}

class _ProviderCoverageRow extends StatelessWidget {
  const _ProviderCoverageRow({
    super.key,
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
              if (row.collectionHealth case final health?) ...[
                _ProviderCollectionHealthIndicator(health: health),
                const SizedBox(width: AppSpacing.xs),
              ],
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

class _ProviderCollectionHealthIndicator extends StatelessWidget {
  const _ProviderCollectionHealthIndicator({required this.health});

  final ReaderSummaryProviderCollectionHealth health;

  @override
  Widget build(BuildContext context) {
    if (health.state == ReaderSummaryCollectionCoverageState.complete) {
      return const SizedBox.shrink();
    }

    final colorScheme = Theme.of(context).colorScheme;
    final (icon, color) = switch (health.state) {
      ReaderSummaryCollectionCoverageState.partial => (
        Icons.info_outline_rounded,
        colorScheme.primary,
      ),
      ReaderSummaryCollectionCoverageState.degraded => (
        Icons.warning_amber_rounded,
        colorScheme.tertiary,
      ),
      ReaderSummaryCollectionCoverageState.unavailable => (
        Icons.error_outline_rounded,
        colorScheme.error,
      ),
      ReaderSummaryCollectionCoverageState.unknown => (
        Icons.help_outline_rounded,
        colorScheme.onSurfaceVariant,
      ),
      ReaderSummaryCollectionCoverageState.complete => (
        Icons.check_circle_outline_rounded,
        colorScheme.primary,
      ),
    };

    return Tooltip(
      message: _providerCollectionHealthTooltip(health),
      child: SizedBox.square(
        dimension: 18,
        child: Icon(icon, size: 16, color: color),
      ),
    );
  }
}

String _providerCollectionHealthTooltip(
  ReaderSummaryProviderCollectionHealth health,
) {
  final details = <String>[_collectionHealthText(health)];
  if (health.rateLimitEventCount > 0) {
    details.add(
      '${health.rateLimitEventCount} rate-limit ${health.rateLimitEventCount == 1 ? 'event' : 'events'}',
    );
  }
  if (health.failureKinds.isNotEmpty) {
    details.add('Failure: ${health.failureKinds.join(', ')}');
  }
  if (health.paginationStopReasons.isNotEmpty) {
    details.add('Stopped: ${health.paginationStopReasons.join(', ')}');
  }
  return details.join('. ');
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
