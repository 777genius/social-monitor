import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../view_models/reader_summary_trust_snapshot.dart';
import 'reader_summary_sections.dart';

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

  @override
  Widget build(BuildContext context) {
    if (widget.claims.isEmpty && widget.reliabilityReport.risks.isEmpty) {
      return const SizedBox.shrink();
    }

    final snapshot = ReaderSummaryTrustSnapshot.from(
      claims: widget.claims,
      report: widget.reliabilityReport,
    );

    return ReaderSummarySection(
      title: 'Trust & evidence',
      icon: Icons.verified_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _TrustBadges(snapshot: snapshot, report: widget.reliabilityReport),
          const SizedBox(height: AppSpacing.xs),
          TextButton.icon(
            key: const ValueKey('reader-summary-trust-toggle'),
            onPressed: () => setState(() => _expanded = !_expanded),
            icon: Icon(
              _expanded
                  ? Icons.expand_less_outlined
                  : Icons.expand_more_outlined,
            ),
            label: Text(_expanded ? 'Hide evidence' : 'View evidence'),
          ),
          if (_expanded) ...[
            const SizedBox(height: AppSpacing.xs),
            _TrustDetails(
              claims: widget.claims,
              report: widget.reliabilityReport,
              citationsById: widget.citationsById,
              onOpenUrl: widget.onOpenUrl,
            ),
          ],
        ],
      ),
    );
  }
}

class _TrustBadges extends StatelessWidget {
  const _TrustBadges({required this.snapshot, required this.report});

  final ReaderSummaryTrustSnapshot snapshot;
  final SummaryReliabilityReport report;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        AppStatusBadge(
          label:
              '${_levelLabel(snapshot.confidenceLevel)} confidence ${_percent(snapshot.confidenceScore)}%',
          tone: _confidenceTone(snapshot.confidenceLevel),
        ),
        if (snapshot.providerCount > 0)
          AppStatusBadge(
            label:
                '${snapshot.providerCount} provider${snapshot.providerCount == 1 ? '' : 's'}',
            tone: snapshot.providerCount > 1
                ? AppStatusTone.success
                : AppStatusTone.warning,
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
            label:
                '${_levelLabel(report.riskLevel)} risk ${_percent(report.riskScore)}%',
            tone: _riskTone(report.riskLevel),
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
                risk.description,
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
    final providerCount = uniqueTrustEvidenceProviders(claim.evidence).length;

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
                  label: _confidenceLabel(claim.confidence),
                  tone: _confidenceTone(claim.confidence.level),
                ),
                AppStatusBadge(
                  label:
                      '${claim.evidence.length} citation${claim.evidence.length == 1 ? '' : 's'}',
                  tone: AppStatusTone.neutral,
                ),
                AppStatusBadge(
                  label:
                      '$providerCount provider${providerCount == 1 ? '' : 's'}',
                  tone: providerCount > 1
                      ? AppStatusTone.success
                      : AppStatusTone.warning,
                ),
                if (claim.risks.isNotEmpty)
                  AppStatusBadge(
                    label: _claimRiskLabel(claim.risks.first.kind),
                    tone: AppStatusTone.warning,
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              claim.confidence.rationale,
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
                claim.risks.first.description,
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

String _confidenceLabel(TopReadConfidence confidence) {
  return '${confidence.level} confidence ${_percent(confidence.score)}%';
}

String _claimRiskLabel(String kind) {
  return switch (kind) {
    'single_source' => 'Single provider',
    'low_confidence' => 'Low confidence',
    _ => 'Needs review',
  };
}

String _levelLabel(String level) {
  return switch (level) {
    'high' => 'High',
    'medium' => 'Medium',
    _ => 'Low',
  };
}

int _percent(double score) => (score.clamp(0, 1) * 100).round();

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
