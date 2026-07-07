import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../formatters/reader_summary_trust_copy.dart';
import '../view_models/reader_summary_trust_snapshot.dart';

part 'reader_summary_trust_summary_line.dart';

class ReaderSummaryTrustPanel extends StatefulWidget {
  const ReaderSummaryTrustPanel({
    super.key,
    required this.claims,
    required this.reliabilityReport,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final List<SummaryClaim> claims;
  final SummaryReliabilityReport reliabilityReport;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryTrustPanel> createState() =>
      _ReaderSummaryTrustPanelState();
}

class _ReaderSummaryTrustPanelState extends State<ReaderSummaryTrustPanel> {
  bool _expanded = false;

  void _toggleExpanded() {
    setState(() => _expanded = !_expanded);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.claims.isEmpty && widget.reliabilityReport.risks.isEmpty) {
      return const SizedBox.shrink();
    }

    final snapshot = ReaderSummaryTrustSnapshot.from(
      claims: widget.claims,
      report: widget.reliabilityReport,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Divider(height: AppSpacing.md),
        Material(
          color: Colors.transparent,
          child: InkWell(
            key: const ValueKey('reader-summary-trust-toggle'),
            borderRadius: BorderRadius.circular(8),
            onTap: _toggleExpanded,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _TrustSummaryLine(
                    snapshot: snapshot,
                    report: widget.reliabilityReport,
                    expanded: _expanded,
                  ),
                  if (_expanded) ...[
                    const SizedBox(height: AppSpacing.sm),
                    _TrustDetails(
                      claims: widget.claims,
                      report: widget.reliabilityReport,
                      citationsById: widget.citationsById,
                      onOpenUrl: widget.onOpenUrl,
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _TrustVerdict extends StatelessWidget {
  const _TrustVerdict({required this.snapshot});

  final ReaderSummaryTrustSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          trustVerdictTitle(snapshot),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: textTheme.titleSmall?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          trustVerdictDescription(snapshot),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: textTheme.bodySmall?.copyWith(
            color: colorScheme.onSurfaceVariant,
            letterSpacing: 0,
          ),
        ),
      ],
    );
  }
}

class _TrustDetails extends StatelessWidget {
  const _TrustDetails({
    required this.claims,
    required this.report,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final List<SummaryClaim> claims;
  final SummaryReliabilityReport report;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (report.risks.isNotEmpty) ...[
          _ReliabilityNotes(report: report),
          const SizedBox(height: AppSpacing.sm),
        ],
        for (final entry in claims.indexed)
          _TrustStory(
            index: entry.$1,
            claim: entry.$2,
            citationsById: citationsById,
            onOpenUrl: onOpenUrl,
          ),
      ],
    );
  }
}

class _ReliabilityNotes extends StatelessWidget {
  const _ReliabilityNotes({required this.report});

  final SummaryReliabilityReport report;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: report.risks
          .take(2)
          .map(
            (risk) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Text(
                trustReliabilityRiskDescription(risk),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 0,
                ),
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _TrustStory extends StatelessWidget {
  const _TrustStory({
    required this.index,
    required this.claim,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final int index;
  final SummaryClaim claim;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final lacksIndependentConfirmation = trustClaimLacksIndependentConfirmation(
      claim,
    );

    return DecoratedBox(
      key: ValueKey('reader-summary-trust-story-$index'),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              claim.claim,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                AppStatusBadge(
                  label: trustConfidenceBadgeLabel(claim.confidence.level),
                  tone: _confidenceTone(claim.confidence.level),
                ),
                AppStatusBadge(
                  label:
                      '${claim.evidence.length} citation${claim.evidence.length == 1 ? '' : 's'}',
                  tone: AppStatusTone.neutral,
                ),
                AppStatusBadge(
                  label: trustClaimSupportLabel(claim),
                  tone: lacksIndependentConfirmation
                      ? AppStatusTone.warning
                      : AppStatusTone.success,
                ),
                if (claim.risks.isNotEmpty)
                  AppStatusBadge(
                    label: trustClaimRiskBadgeLabel(claim.risks.first.kind),
                    tone: AppStatusTone.warning,
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              trustConfidenceExplanation(claim.confidence),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: colorScheme.onSurfaceVariant,
                letterSpacing: 0,
              ),
            ),
            if (claim.risks.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                trustClaimRiskDescription(claim.risks.first),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                  letterSpacing: 0,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.xs),
            for (final evidence in claim.evidence)
              _EvidenceLine(
                evidence: evidence,
                citation: citationsById[evidence.citationId],
                onOpenUrl: onOpenUrl,
              ),
          ],
        ),
      ),
    );
  }
}

class _EvidenceLine extends StatelessWidget {
  const _EvidenceLine({
    required this.evidence,
    required this.citation,
    required this.onOpenUrl,
  });

  final SummaryClaimEvidence evidence;
  final SummaryCitation? citation;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final url = evidence.canonicalUrl ?? citation?.canonicalUrl;
    final label = citation?.sourceLabel ?? evidence.providerKey;

    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.link_outlined,
            size: 16,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: AppSpacing.xs),
          Expanded(
            child: Text(
              '$label - ${evidence.title}',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ),
          if (url != null)
            IconButton(
              key: ValueKey(
                'reader-summary-trust-evidence-source-${evidence.citationId}',
              ),
              tooltip: 'Open source',
              visualDensity: VisualDensity.compact,
              onPressed: () => onOpenUrl(url),
              icon: const Icon(Icons.open_in_new_outlined, size: 16),
            ),
        ],
      ),
    );
  }
}

AppStatusTone _confidenceTone(String level) {
  return switch (level) {
    'high' => AppStatusTone.success,
    'medium' => AppStatusTone.neutral,
    _ => AppStatusTone.warning,
  };
}

AppStatusTone _riskTone(String level) {
  return switch (level) {
    'high' => AppStatusTone.danger,
    'medium' => AppStatusTone.warning,
    _ => AppStatusTone.neutral,
  };
}
