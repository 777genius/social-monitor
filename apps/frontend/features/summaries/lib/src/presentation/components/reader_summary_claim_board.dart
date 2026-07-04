import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import 'reader_summary_sections.dart';

const _initialVisibleClaims = 5;

class ReaderSummaryClaimBoard extends StatefulWidget {
  const ReaderSummaryClaimBoard({
    super.key,
    required this.claims,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final List<SummaryClaim> claims;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryClaimBoard> createState() =>
      _ReaderSummaryClaimBoardState();
}

class _ReaderSummaryClaimBoardState extends State<ReaderSummaryClaimBoard> {
  final Set<int> _expandedRows = {};
  bool _showAll = false;

  @override
  Widget build(BuildContext context) {
    if (widget.claims.isEmpty) {
      return const SizedBox.shrink();
    }

    final visibleCount =
        _showAll || widget.claims.length <= _initialVisibleClaims
        ? widget.claims.length
        : _initialVisibleClaims;
    final visibleClaims = widget.claims.take(visibleCount).toList();
    final hiddenCount = widget.claims.length - visibleCount;

    return ReaderSummarySection(
      title: 'Claim board',
      icon: Icons.fact_check_outlined,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: Text(
              'Showing $visibleCount of ${widget.claims.length} cited claims',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ),
          ...visibleClaims.indexed.map(
            (entry) => _ClaimBoardRow(
              index: entry.$1,
              claim: entry.$2,
              expanded: _expandedRows.contains(entry.$1),
              citationsById: widget.citationsById,
              onToggle: () => _toggleRow(entry.$1),
              onOpenUrl: widget.onOpenUrl,
            ),
          ),
          if (widget.claims.length > _initialVisibleClaims) ...[
            const SizedBox(height: AppSpacing.xs),
            TextButton.icon(
              key: const ValueKey('reader-summary-claim-board-toggle'),
              onPressed: () => setState(() => _showAll = !_showAll),
              icon: Icon(
                _showAll
                    ? Icons.expand_less_outlined
                    : Icons.expand_more_outlined,
              ),
              label: Text(_showAll ? 'Show fewer' : 'Show $hiddenCount more'),
            ),
          ],
        ],
      ),
    );
  }

  void _toggleRow(int index) {
    setState(() {
      if (!_expandedRows.add(index)) {
        _expandedRows.remove(index);
      }
    });
  }
}

class _ClaimBoardRow extends StatelessWidget {
  const _ClaimBoardRow({
    required this.index,
    required this.claim,
    required this.expanded,
    required this.citationsById,
    required this.onToggle,
    required this.onOpenUrl,
  });

  final int index;
  final SummaryClaim claim;
  final bool expanded;
  final Map<String, SummaryCitation> citationsById;
  final VoidCallback onToggle;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      key: ValueKey('reader-summary-claim-board-row-$index'),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colorScheme.outlineVariant)),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(
                    claim.claim,
                    maxLines: expanded ? 4 : 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                IconButton(
                  key: ValueKey('reader-summary-claim-board-expand-$index'),
                  tooltip: expanded ? 'Hide evidence' : 'Show evidence',
                  onPressed: onToggle,
                  icon: Icon(
                    expanded
                        ? Icons.expand_less_outlined
                        : Icons.expand_more_outlined,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Wrap(
              spacing: AppSpacing.xs,
              runSpacing: AppSpacing.xs,
              children: [
                AppStatusBadge(
                  label: _confidenceLabel(claim.confidence),
                  tone: _confidenceTone(claim.confidence),
                ),
                AppStatusBadge(
                  label:
                      '${claim.evidence.length} source${claim.evidence.length == 1 ? '' : 's'}',
                  tone: claim.evidence.length > 1
                      ? AppStatusTone.success
                      : AppStatusTone.neutral,
                ),
                if (claim.risks.isNotEmpty)
                  AppStatusBadge(
                    label:
                        '${claim.risks.length} risk${claim.risks.length == 1 ? '' : 's'}',
                    tone: AppStatusTone.warning,
                  ),
              ],
            ),
            if (expanded) ...[
              const SizedBox(height: AppSpacing.sm),
              _ClaimEvidenceList(
                claim: claim,
                citationsById: citationsById,
                onOpenUrl: onOpenUrl,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ClaimEvidenceList extends StatelessWidget {
  const _ClaimEvidenceList({
    required this.claim,
    required this.citationsById,
    required this.onOpenUrl,
  });

  final SummaryClaim claim;
  final Map<String, SummaryCitation> citationsById;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final evidence in claim.evidence)
          _EvidenceLine(
            evidence: evidence,
            citation: citationsById[evidence.citationId],
            onOpenUrl: onOpenUrl,
          ),
        if (claim.risks.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            claim.risks.first.description,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              letterSpacing: 0,
            ),
          ),
        ],
      ],
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
  final percent = (confidence.score.clamp(0, 1) * 100).round();

  return '${confidence.level} confidence $percent%';
}

AppStatusTone _confidenceTone(TopReadConfidence confidence) {
  return switch (confidence.level) {
    'high' => AppStatusTone.success,
    'medium' => AppStatusTone.neutral,
    _ => AppStatusTone.warning,
  };
}
