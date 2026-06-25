import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/entities/generated_briefing.dart';
import '../../domain/entities/summary_citation.dart';
import 'reader_briefing_provider_label.dart';

class ReaderBriefingTopReadDetails extends StatelessWidget {
  const ReaderBriefingTopReadDetails({
    super.key,
    required this.index,
    required this.item,
    required this.citations,
  });

  final int index;
  final BriefingReaderItem item;
  final List<SummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    final rankingMetrics = item.providerMetrics
        .where(_isRankingMetric)
        .toList(growable: false);
    final rawMetrics = item.providerMetrics
        .where((metric) => !_isRankingMetric(metric))
        .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InlineLabelList(
          label: 'Why ranked high',
          values: [item.reason, item.whyNow],
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            AppStatusBadge(
              label: 'Signal ${item.signalScore.toStringAsFixed(2)}',
              tone: AppStatusTone.neutral,
            ),
            AppStatusBadge(
              label: readerBriefingConfidenceLabel(item.confidence),
              tone: readerBriefingConfidenceTone(item.confidence),
            ),
            ...item.confirmedProviderKeys
                .take(4)
                .map(
                  (providerKey) => AppStatusBadge(
                    label: readerBriefingProviderLabel(providerKey),
                    tone: item.confirmedProviderKeys.length > 1
                        ? AppStatusTone.success
                        : AppStatusTone.neutral,
                  ),
                ),
          ],
        ),
        if (item.whyImportant.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _InlineLabelList(
            label: 'Why this matters',
            values: item.whyImportant.take(3).toList(),
          ),
        ],
        if (rankingMetrics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _MetricBadgeGroup(label: 'Ranking inputs', metrics: rankingMetrics),
        ],
        if (rawMetrics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _MetricBadgeGroup(label: 'Source metrics', metrics: rawMetrics),
        ],
        if (item.canonicalUrl != null) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            item.canonicalUrl!,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
              fontWeight: FontWeight.w700,
              letterSpacing: 0,
            ),
          ),
        ],
        if (citations.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _CitationDisclosure(index: index, citations: citations),
        ],
      ],
    );
  }
}

String readerBriefingConfidenceLabel(
  BriefingReaderItemConfidence confidence, {
  bool compact = false,
}) {
  final score = (confidence.score * 100).round().clamp(0, 100);
  final level = switch (confidence.level) {
    'high' => 'High',
    'medium' => 'Medium',
    _ => 'Low',
  };
  if (compact) {
    return '$level $score%';
  }
  return '$level confidence $score%';
}

AppStatusTone readerBriefingConfidenceTone(
  BriefingReaderItemConfidence confidence,
) {
  return switch (confidence.level) {
    'high' => AppStatusTone.success,
    'medium' => AppStatusTone.neutral,
    _ => AppStatusTone.warning,
  };
}

class _MetricBadgeGroup extends StatelessWidget {
  const _MetricBadgeGroup({required this.label, required this.metrics});

  final String label;
  final List<BriefingProviderMetric> metrics;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 2),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: metrics
              .map(
                (metric) => AppStatusBadge(
                  label: '${metric.label}: ${metric.value}',
                  tone: AppStatusTone.neutral,
                ),
              )
              .toList(growable: false),
        ),
      ],
    );
  }
}

class _InlineLabelList extends StatelessWidget {
  const _InlineLabelList({required this.label, required this.values});

  final String label;
  final List<String> values;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
            fontWeight: FontWeight.w900,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: 2),
        ...values.map(
          (value) => Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ),
      ],
    );
  }
}

class _CitationDisclosure extends StatelessWidget {
  const _CitationDisclosure({required this.index, required this.citations});

  final int index;
  final List<SummaryCitation> citations;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: ValueKey('reader-brief-top-read-$index-citations'),
        tilePadding: EdgeInsets.zero,
        childrenPadding: EdgeInsets.zero,
        title: Text(
          'Citations (${citations.length})',
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        children: citations
            .map(
              (citation) => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      citation.sourceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                    Text(
                      citation.safeSnippet,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                    if (citation.canonicalUrl != null)
                      Text(
                        citation.canonicalUrl!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0,
                        ),
                      ),
                  ],
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

bool _isRankingMetric(BriefingProviderMetric metric) {
  const labels = {
    'Story signal',
    'Base signal',
    'Cross-source support',
    'Same-source support',
    'Provider diversity',
    'Topic diversity',
    'Freshness',
    'Confirmed by',
    'Evidence items',
  };

  return labels.contains(metric.label);
}
