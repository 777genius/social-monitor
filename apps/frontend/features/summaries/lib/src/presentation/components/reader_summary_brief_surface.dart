import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/summary_citation.dart';
import 'github_mark.dart';
import 'reader_summary_citation_text.dart';
import 'reader_summary_external_link.dart';
import 'reader_summary_preview_media.dart';
import 'reader_summary_provider_label.dart';
import 'reader_summary_reason_text.dart';

part 'reader_summary_ai_brief.dart';
part 'reader_summary_filtered_evidence.dart';
part 'reader_summary_evidence_read_card.dart';
part 'reader_summary_brief_helpers.dart';
part 'reader_summary_metric_badges.dart';

class ReaderSummaryBriefSurface extends StatefulWidget {
  const ReaderSummaryBriefSurface({
    super.key,
    required this.summary,
    required this.citationsById,
    required this.isRefreshing,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final Map<String, SummaryCitation> citationsById;
  final bool isRefreshing;
  final ValueChanged<String> onOpenUrl;

  @override
  State<ReaderSummaryBriefSurface> createState() =>
      _ReaderSummaryBriefSurfaceState();
}

class _ReaderSummaryBriefSurfaceState extends State<ReaderSummaryBriefSurface> {
  String? _selectedProviderKey;

  @override
  Widget build(BuildContext context) {
    final content = widget.summary.content;
    final selectedTopReads = _selectedProviderKey == null
        ? content.topReads
        : content.topReads
              .where((item) => item.providerKey == _selectedProviderKey)
              .toList(growable: false);
    final selectedCitations = _selectedProviderKey == null
        ? const <SummaryCitation>[]
        : widget.summary.citations
              .where(
                (citation) =>
                    _citationMatchesProvider(citation, _selectedProviderKey!),
              )
              .toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _BriefToolbar(
          sourceCount: content.sourceMix.length,
          freshnessLabel: widget.summary.freshnessLabel,
          isRefreshing: widget.isRefreshing,
          isDegraded: widget.summary.isDegraded,
          qualityState: content.qualityState,
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: SelectionArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _AiBriefCopy(
                  content: content,
                  citationsById: widget.citationsById,
                  onOpenUrl: widget.onOpenUrl,
                ),
                const SizedBox(height: AppSpacing.md),
                _SourceFilterChips(
                  entries: content.sourceMix,
                  selectedProviderKey: _selectedProviderKey,
                  topReadCount: content.topReads.length,
                  onSelected: (providerKey) {
                    setState(() => _selectedProviderKey = providerKey);
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                _FilteredEvidenceList(
                  selectedProviderKey: _selectedProviderKey,
                  topReads: selectedTopReads,
                  fallbackCitations: selectedCitations,
                  citationsById: widget.citationsById,
                  onOpenUrl: widget.onOpenUrl,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _BriefToolbar extends StatelessWidget {
  const _BriefToolbar({
    required this.sourceCount,
    required this.freshnessLabel,
    required this.isRefreshing,
    required this.isDegraded,
    required this.qualityState,
  });

  final int sourceCount;
  final String freshnessLabel;
  final bool isRefreshing;
  final bool isDegraded;
  final ReaderSummaryQualityState qualityState;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.md,
        0,
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final sourceLabel = sourceCount == 1 ? 'source' : 'sources';
          final titleText = sourceCount <= 0
              ? 'AI summary'
              : 'AI summary · $sourceCount $sourceLabel';
          final title = Text(
            titleText,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w900,
              letterSpacing: 0,
            ),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          );
          final badges = Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              AppStatusBadge(
                label: isRefreshing ? 'Refreshing' : freshnessLabel,
                tone: AppStatusTone.success,
              ),
              AppStatusBadge(
                label: _confidenceLabel(),
                tone: _confidenceTone(),
              ),
            ],
          );
          if (constraints.maxWidth < 420) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                title,
                const SizedBox(height: AppSpacing.xs),
                badges,
              ],
            );
          }
          return Row(
            children: [
              Expanded(child: title),
              badges,
            ],
          );
        },
      ),
    );
  }

  String _confidenceLabel() {
    if (qualityState.isSingleSource || qualityState.warnings.isNotEmpty) {
      return 'Needs confirmation';
    }
    return switch (qualityState.status) {
      'ready' when !isDegraded => 'High confidence',
      'low_confidence' => 'Low confidence',
      'limited_sources' => 'Needs confirmation',
      'partial' => 'Partial evidence',
      'failed_provider' => 'Provider issue',
      'no_signal' => 'No signal',
      _ => 'Medium confidence',
    };
  }

  AppStatusTone _confidenceTone() {
    if (qualityState.status == 'failed_provider' ||
        qualityState.status == 'no_signal') {
      return AppStatusTone.danger;
    }
    if (qualityState.isSingleSource ||
        qualityState.warnings.isNotEmpty ||
        isDegraded ||
        qualityState.status != 'ready') {
      return AppStatusTone.warning;
    }
    return AppStatusTone.success;
  }
}
