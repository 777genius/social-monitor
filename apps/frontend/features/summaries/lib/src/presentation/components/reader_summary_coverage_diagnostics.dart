part of 'reader_summary_brief_surface.dart';

class _CoverageDiagnosticsSection extends StatelessWidget {
  const _CoverageDiagnosticsSection({required this.coverage});

  final ReaderSummaryCoverage coverage;

  @override
  Widget build(BuildContext context) {
    final signals = _coverageSignalChips(coverage);
    final topics = coverage.topicBreakdown
        .where((topic) => topic.collectedFeedItemCount > 0)
        .take(4)
        .toList(growable: false);
    final queries = coverage.queryBreakdown
        .where((query) => query.collectedFeedItemCount > 0)
        .take(4)
        .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _RailSectionLabel(
          label: 'Coverage signals',
          infoTooltip:
              'Topics and queries show where collected posts came from. Low relevance and muted are collection quality signals, not selected evidence.',
        ),
        if (signals.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: signals,
          ),
        ],
        if (topics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          _CoverageDiagnosticsRows(
            title: 'Topics',
            rows: [
              for (final topic in topics)
                _CoverageDiagnosticRow(
                  label: topic.topicLabel ?? topic.topicKey,
                  collectedFeedItemCount: topic.collectedFeedItemCount,
                  lowRelevanceFeedItemCount: topic.lowRelevanceFeedItemCount,
                  mutedFeedItemCount: topic.mutedFeedItemCount,
                ),
            ],
          ),
        ],
        if (queries.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          _CoverageDiagnosticsRows(
            title: 'Queries',
            rows: [
              for (final query in queries)
                _CoverageDiagnosticRow(
                  label: query.query,
                  collectedFeedItemCount: query.collectedFeedItemCount,
                  lowRelevanceFeedItemCount: query.lowRelevanceFeedItemCount,
                  mutedFeedItemCount: query.mutedFeedItemCount,
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _CoverageDiagnosticsRows extends StatelessWidget {
  const _CoverageDiagnosticsRows({required this.title, required this.rows});

  final String title;
  final List<_CoverageDiagnosticRow> rows;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: textTheme.labelSmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        for (final row in rows) row,
      ],
    );
  }
}

class _CoverageDiagnosticRow extends StatelessWidget {
  const _CoverageDiagnosticRow({
    required this.label,
    required this.collectedFeedItemCount,
    required this.lowRelevanceFeedItemCount,
    required this.mutedFeedItemCount,
  });

  final String label;
  final int collectedFeedItemCount;
  final int lowRelevanceFeedItemCount;
  final int mutedFeedItemCount;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: textTheme.labelSmall?.copyWith(
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
          Text(
            _coverageDiagnosticText(
              collectedFeedItemCount: collectedFeedItemCount,
              lowRelevanceFeedItemCount: lowRelevanceFeedItemCount,
              mutedFeedItemCount: mutedFeedItemCount,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: textTheme.labelSmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              letterSpacing: 0,
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverageSignalChip extends StatelessWidget {
  const _CoverageSignalChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.sm,
          vertical: AppSpacing.xs,
        ),
        child: Text(
          label,
          style: textTheme.labelSmall?.copyWith(
            color: color,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
      ),
    );
  }
}

bool _hasCoverageDiagnostics(ReaderSummaryCoverage? coverage) {
  if (coverage == null) {
    return false;
  }

  return coverage.lowRelevanceFeedItemCount > 0 ||
      coverage.mutedFeedItemCount > 0 ||
      coverage.userRatedFeedItemCount > 0 ||
      coverage.topicBreakdown.isNotEmpty ||
      coverage.queryBreakdown.isNotEmpty;
}

List<Widget> _coverageSignalChips(ReaderSummaryCoverage coverage) {
  return [
    if (coverage.lowRelevanceFeedItemCount > 0)
      _CoverageSignalChip(
        label:
            '${formatCompactCount(coverage.lowRelevanceFeedItemCount)} low rel.',
        color: AppColors.chartRed,
      ),
    if (coverage.mutedFeedItemCount > 0)
      _CoverageSignalChip(
        label: '${formatCompactCount(coverage.mutedFeedItemCount)} muted',
        color: AppColors.chartOrange,
      ),
    if (coverage.userRatedFeedItemCount > 0)
      _CoverageSignalChip(
        label: '${formatCompactCount(coverage.userRatedFeedItemCount)} rated',
        color: AppColors.chartBlue,
      ),
  ];
}

String _coverageDiagnosticText({
  required int collectedFeedItemCount,
  required int lowRelevanceFeedItemCount,
  required int mutedFeedItemCount,
}) {
  final parts = <String>[
    '${formatCompactCount(collectedFeedItemCount)} collected',
  ];
  if (lowRelevanceFeedItemCount > 0) {
    parts.add('${formatCompactCount(lowRelevanceFeedItemCount)} low');
  }
  if (mutedFeedItemCount > 0) {
    parts.add('${formatCompactCount(mutedFeedItemCount)} muted');
  }

  return parts.join(' · ');
}
