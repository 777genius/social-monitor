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
    final screen = AppScreenClass.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final singleLine =
            !screen.isCompact &&
            constraints.maxWidth.isFinite &&
            constraints.maxWidth >= 760;
        if (!singleLine) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const _TrustPanelTitle(),
              const SizedBox(height: AppSpacing.xs),
              _TrustVerdict(snapshot: snapshot),
              const SizedBox(height: AppSpacing.xs),
              _TrustBadges(snapshot: snapshot, report: report),
              const SizedBox(height: AppSpacing.xs),
              _TrustToggleLabel(expanded: expanded),
            ],
          );
        }

        return Row(
          children: [
            const _TrustPanelTitle(),
            const SizedBox(width: AppSpacing.md),
            Flexible(
              flex: 2,
              child: Text(
                trustVerdictTitle(snapshot),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              flex: 4,
              child: Text(
                trustVerdictDescription(snapshot),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 0,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Flexible(
              flex: 5,
              child: _TrustBadges(
                snapshot: snapshot,
                report: report,
                singleLine: true,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            _TrustToggleLabel(expanded: expanded),
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
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.verified_outlined, size: 18),
        const SizedBox(width: AppSpacing.xs),
        Text(
          'Trust & evidence',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
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

class _TrustBadgeRow extends StatelessWidget {
  const _TrustBadgeRow({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final child in children) ...[
            child,
            if (child != children.last) const SizedBox(width: AppSpacing.xs),
          ],
        ],
      ),
    );
  }
}

class _TrustBadges extends StatelessWidget {
  const _TrustBadges({
    required this.snapshot,
    required this.report,
    this.singleLine = false,
  });

  final ReaderSummaryTrustSnapshot snapshot;
  final SummaryReliabilityReport report;
  final bool singleLine;

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
      AppStatusBadge(
        label: snapshot.needsConfirmation
            ? 'Needs confirmation'
            : 'Evidence linked',
        tone: snapshot.needsConfirmation
            ? AppStatusTone.warning
            : AppStatusTone.success,
      ),
      if (report.risks.isNotEmpty)
        AppStatusBadge(
          label: trustEvidenceRiskBadgeLabel(report.riskLevel),
          tone: _riskTone(report.riskLevel),
        ),
    ];
    if (singleLine) {
      return _TrustBadgeRow(children: badges);
    }

    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: badges,
    );
  }
}
