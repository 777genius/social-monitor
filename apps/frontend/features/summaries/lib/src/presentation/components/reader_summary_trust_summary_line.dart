part of 'reader_summary_trust_panel.dart';

class _TrustSummaryLine extends StatelessWidget {
  const _TrustSummaryLine({
    required this.snapshot,
    required this.report,
    required this.expanded,
  });

  final ReaderSummaryTrustSnapshot snapshot;
  final SummaryReliabilityReport report;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isNarrow = constraints.maxWidth < 430 ||
            MediaQuery.textScalerOf(context).scale(1) > 1.3;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (isNarrow) ...[
              const _TrustPanelTitle(),
              const SizedBox(height: AppSpacing.xs),
              _TrustToggleLabel(expanded: expanded),
            ] else
              Row(
                children: [
                  const Expanded(child: _TrustPanelTitle()),
                  const SizedBox(width: AppSpacing.xs),
                  _TrustToggleLabel(expanded: expanded),
                ],
              ),
            const SizedBox(height: AppSpacing.sm),
            _TrustVerdict(snapshot: snapshot),
            const SizedBox(height: AppSpacing.sm),
            _TrustBadges(snapshot: snapshot, report: report),
          ],
        );
      },
    );
  }
}

class _TrustPanelTitle extends StatelessWidget {
  const _TrustPanelTitle();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(
          Icons.verified_outlined,
          size: 18,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            'Trust & evidence',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
          ),
        ),
      ],
    );
  }
}

class _TrustToggleLabel extends StatelessWidget {
  const _TrustToggleLabel({required this.expanded});

  final bool expanded;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          expanded ? Icons.expand_less_outlined : Icons.expand_more_outlined,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: AppSpacing.xs),
        Text(
          expanded ? 'Hide evidence' : 'Why trust this?',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
            color: Theme.of(context).colorScheme.primary,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

class _TrustBadges extends StatelessWidget {
  const _TrustBadges({
    required this.snapshot,
    required this.report,
  });

  final ReaderSummaryTrustSnapshot snapshot;
  final SummaryReliabilityReport report;

  @override
  Widget build(BuildContext context) {
    final badges = [
      AppStatusBadge(
        label: trustSummaryConfidenceBadgeLabel(snapshot),
        tone: _confidenceTone(snapshot.confidenceLevel),
      ),
      if (snapshot.sourceGroupCount > 0)
        AppStatusBadge(
          label: trustSourceGroupLabel(snapshot.sourceGroupCount),
          tone: AppStatusTone.neutral,
        ),
      if (report.risks.isNotEmpty)
        AppStatusBadge(
          label: trustEvidenceRiskBadgeLabel(report.riskLevel),
          tone: _riskTone(report.riskLevel),
        ),
    ];
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: badges,
    );
  }
}
