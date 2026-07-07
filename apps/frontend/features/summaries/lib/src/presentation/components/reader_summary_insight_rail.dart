part of 'reader_summary_brief_surface.dart';

/// Right rail of the executive summary board: diagnostics and topic map.
class ReaderSummaryInsightRail extends StatelessWidget {
  const ReaderSummaryInsightRail({
    super.key,
    required this.summary,
    this.showCoverageDiagnostics = false,
  });

  final ReaderSummary summary;
  final bool showCoverageDiagnostics;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (showCoverageDiagnostics &&
            _hasCoverageDiagnostics(summary.coverage)) ...[
          _CoverageDiagnosticsSection(coverage: summary.coverage!),
          const SizedBox(height: AppSpacing.lg),
        ],
        if (!summary.content.topicMap.isEmpty) ...[
          ReaderSummaryTopicMapPanel(topicMap: summary.content.topicMap),
        ],
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
