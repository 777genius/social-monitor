import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import 'reader_summary_citation_text.dart';
import 'reader_summary_confirmation.dart';
import 'reader_summary_external_link.dart';
import 'reader_summary_provider_logo.dart';
import 'reader_summary_reason_text.dart';

class ReaderSummaryTopReadDetails extends StatelessWidget {
  const ReaderSummaryTopReadDetails({
    super.key,
    required this.index,
    required this.item,
    required this.citations,
    required this.onOpenUrl,
    this.citationsInitiallyExpanded = false,
  });

  final int index;
  final TopRead item;
  final List<SummaryCitation> citations;
  final ValueChanged<String> onOpenUrl;
  final bool citationsInitiallyExpanded;

  @override
  Widget build(BuildContext context) {
    final sourceSupportBadge = readerSummarySourceSupportBadge(item, citations);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InlineLabelList(
          label: 'Why ranked high',
          values: [readerSummaryDisplayReason(item), item.whyNow],
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          children: [
            AppStatusBadge(
              label: 'signal ${item.signalScore.toFixed(2)}',
              tone: AppStatusTone.neutral,
            ),
            if (sourceSupportBadge != null)
              AppStatusBadge(
                label: sourceSupportBadge,
                tone: AppStatusTone.success,
              ),
            AppStatusBadge(
              label: readerSummaryConfidenceLabel(item.confidence),
              tone: readerSummaryConfidenceTone(item.confidence),
            ),
            ...item.confirmedProviderKeys
                .take(4)
                .map(
                  (providerKey) =>
                      ReaderSummaryProviderLogoChip(providerKey: providerKey),
                ),
          ],
        ),
        if (readerSummaryDisplayWhyImportant(item).isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _InlineLabelList(
            label: 'Why this matters',
            values: readerSummaryDisplayWhyImportant(item),
          ),
        ],
        if (item.providerMetrics.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _MetricBadgeGroup(
            label: 'Source metrics',
            metrics: item.providerMetrics,
          ),
        ],
        if (item.canonicalUrl != null) ...[
          const SizedBox(height: AppSpacing.xs),
          ReaderSummaryExternalLink(
            url: item.canonicalUrl!,
            onOpenUrl: onOpenUrl,
          ),
        ],
        if (citations.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          _CitationDisclosure(
            index: index,
            citations: citations,
            initiallyExpanded: citationsInitiallyExpanded,
            onOpenUrl: onOpenUrl,
          ),
        ],
      ],
    );
  }
}

String readerSummaryConfidenceLabel(
  TopReadConfidence confidence, {
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

AppStatusTone readerSummaryConfidenceTone(TopReadConfidence confidence) {
  return switch (confidence.level) {
    'high' => AppStatusTone.success,
    'medium' => AppStatusTone.neutral,
    _ => AppStatusTone.warning,
  };
}

class _MetricBadgeGroup extends StatelessWidget {
  const _MetricBadgeGroup({required this.label, required this.metrics});

  final String label;
  final List<ProviderMetric> metrics;

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
  const _CitationDisclosure({
    required this.index,
    required this.citations,
    required this.initiallyExpanded,
    required this.onOpenUrl,
  });

  final int index;
  final List<SummaryCitation> citations;
  final bool initiallyExpanded;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    return Theme(
      data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
      child: ExpansionTile(
        key: ValueKey('reader-summary-top-read-$index-citations'),
        initiallyExpanded: initiallyExpanded,
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
            .map((citation) {
              final snippet = readerSummaryDisplayCitationSnippet(citation);
              return Padding(
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
                    if (snippet != null)
                      Text(
                        snippet,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    if (citation.canonicalUrl != null)
                      ReaderSummaryExternalLink(
                        url: citation.canonicalUrl!,
                        onOpenUrl: onOpenUrl,
                      ),
                  ],
                ),
              );
            })
            .toList(growable: false),
      ),
    );
  }
}
