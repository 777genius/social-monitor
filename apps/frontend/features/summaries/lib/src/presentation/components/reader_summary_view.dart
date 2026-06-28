import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_action_target.dart';
import 'reader_summary_brief_surface.dart';
import 'reader_summary_coverage_summary.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_quality_summary.dart';
import 'reader_summary_sections.dart';

class ReaderSummaryView extends StatelessWidget {
  const ReaderSummaryView({
    super.key,
    required this.summary,
    required this.isRefreshing,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final bool isRefreshing;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final content = summary.content;
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };

    return SelectionArea(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ReaderSummaryBriefSurface(
            summary: summary,
            citationsById: citationsById,
            isRefreshing: isRefreshing,
            onOpenUrl: onOpenUrl,
          ),
          if (_hasEvidenceAndQuality(content, summary.isDegraded)) ...[
            const SizedBox(height: AppSpacing.md),
            _EvidenceAndQualityDisclosure(
              content: content,
              isDegraded: summary.isDegraded,
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppCommandBar(
            actions: [
              AppCommandAction(
                label: isRefreshing ? 'Generating' : 'Regenerate',
                icon: Icons.auto_awesome_outlined,
                controlKeyBase: 'workspace-summary-generate',
                enabled: !isRefreshing,
                reason: isRefreshing
                    ? 'Workspace summary generation is already running'
                    : null,
                onPressed: onGenerate,
              ),
            ],
          ),
        ],
      ),
    );
  }

  bool _hasTrendDelta(ReaderTrendDelta delta) {
    return delta.newSignals.isNotEmpty ||
        delta.growingSignals.isNotEmpty ||
        delta.repeatedSignals.isNotEmpty ||
        delta.fadingSignals.isNotEmpty;
  }

  bool _hasQualitySignal(
    ReaderSummaryQualityState qualityState,
    bool isDegraded,
  ) {
    return isDegraded ||
        qualityState.status != 'ready' ||
        qualityState.warnings.isNotEmpty ||
        qualityState.isSingleSource;
  }

  bool _hasEvidenceAndQuality(ReaderSummaryContent content, bool isDegraded) {
    return _hasQualitySignal(content.qualityState, isDegraded) ||
        content.sourceMix.isNotEmpty ||
        content.topicSections.isNotEmpty ||
        _hasTrendDelta(content.trendDelta) ||
        content.openQuestions.isNotEmpty ||
        content.risks.isNotEmpty;
  }
}

class _EvidenceAndQualityDisclosure extends StatelessWidget {
  const _EvidenceAndQualityDisclosure({
    required this.content,
    required this.isDegraded,
  });

  final ReaderSummaryContent content;
  final bool isDegraded;

  @override
  Widget build(BuildContext context) {
    return ReaderSummarySection(
      title: 'Evidence and quality',
      icon: Icons.fact_check_outlined,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: const ValueKey('reader-summary-evidence-quality'),
          tilePadding: EdgeInsets.zero,
          childrenPadding: EdgeInsets.zero,
          title: Text(
            'Review source mix, topic context and reliability checks',
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          children: [
            if (_hasQualitySignal(content.qualityState, isDegraded)) ...[
              ReaderSummaryQualitySummary(
                qualityState: content.qualityState,
                isDegraded: isDegraded,
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (content.sourceMix.isNotEmpty) ...[
              ReaderSummaryCoverageSummary(entries: content.sourceMix),
              const SizedBox(height: AppSpacing.md),
            ],
            if (content.topicSections.isNotEmpty) ...[
              ReaderSummaryTopicSections(
                sections: content.topicSections.take(3).toList(),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (_hasTrendDelta(content.trendDelta)) ...[
              ReaderSummaryTrendDelta(delta: content.trendDelta),
              const SizedBox(height: AppSpacing.md),
            ],
            if (content.openQuestions.isNotEmpty || content.risks.isNotEmpty)
              ReaderSummaryWatchouts(
                questions: content.openQuestions,
                risks: content.risks,
              ),
          ],
        ),
      ),
    );
  }

  bool _hasTrendDelta(ReaderTrendDelta delta) {
    return delta.newSignals.isNotEmpty ||
        delta.growingSignals.isNotEmpty ||
        delta.repeatedSignals.isNotEmpty ||
        delta.fadingSignals.isNotEmpty;
  }

  bool _hasQualitySignal(
    ReaderSummaryQualityState qualityState,
    bool isDegraded,
  ) {
    return isDegraded ||
        qualityState.status != 'ready' ||
        qualityState.warnings.isNotEmpty ||
        qualityState.isSingleSource;
  }
}
