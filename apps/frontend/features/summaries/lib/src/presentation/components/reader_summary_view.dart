import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/value_objects/reader_action_target.dart';
import 'reader_summary_coverage_summary.dart';
import 'reader_summary_next_actions.dart';
import 'reader_summary_provider_label.dart';
import 'reader_summary_quality_summary.dart';
import 'reader_summary_sections.dart';
import 'reader_summary_top_reads.dart';

const _maxVisibleTopReads = 10;

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
  });

  final ReaderSummary summary;
  final bool isRefreshing;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderAction action) intentForAction;
  final ReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final content = summary.content;
    final citationsById = {
      for (final citation in summary.citations) citation.id: citation,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SummaryHeader(
          title: content.headline,
          isRefreshing: isRefreshing,
          freshnessLabel: summary.freshnessLabel,
          isDegraded: summary.isDegraded,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          _readerSummaryDisplayText(content.oneLineTakeaway),
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            height: 1.45,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        if (content.bullets.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          _BulletList(
            items: content.bullets
                .take(4)
                .map(_readerSummaryDisplayText)
                .toList(),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        _EvidenceStrip(
          sourceMix: content.sourceMix,
          citationCount: summary.citations.length,
          topReadCount: content.topReads.length,
        ),
        if (content.nextActions.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          ReaderSummaryActions(
            actions: content.nextActions.take(5).toList(),
            actionState: readerActionState,
            activeActionIdempotencyKey: activeReaderActionIdempotencyKey,
            lastActionIdempotencyKey: lastReaderActionIdempotencyKey,
            intentForAction: intentForAction,
            onAction: onAction,
          ),
        ],
        if (content.topReads.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          ReaderSummaryTopReads(
            items: content.topReads.take(_maxVisibleTopReads).toList(),
            citationsById: citationsById,
          ),
        ],
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

class _EvidenceStrip extends StatelessWidget {
  const _EvidenceStrip({
    required this.sourceMix,
    required this.citationCount,
    required this.topReadCount,
  });

  final List<SourceMixEntry> sourceMix;
  final int citationCount;
  final int topReadCount;

  @override
  Widget build(BuildContext context) {
    final isSingleSource = sourceMix.length == 1;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _sourceMixText(sourceMix),
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontWeight: FontWeight.w700,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Wrap(
          spacing: AppSpacing.xs,
          runSpacing: AppSpacing.xs,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            AppStatusBadge(
              label: '$topReadCount top reads',
              tone: AppStatusTone.neutral,
            ),
            AppStatusBadge(
              label: '$citationCount citations',
              tone: AppStatusTone.neutral,
            ),
            for (final entry in sourceMix.take(5))
              AppStatusBadge(
                label:
                    '${readerSummaryProviderLabel(entry.providerKey)} ${entry.itemCount}',
                tone: AppStatusTone.neutral,
              ),
            if (isSingleSource)
              const AppStatusBadge(
                label: 'single-source',
                tone: AppStatusTone.warning,
              ),
          ],
        ),
      ],
    );
  }
}

String _sourceMixText(List<SourceMixEntry> entries) {
  if (entries.isEmpty) {
    return 'No cited source mix is available yet.';
  }

  if (entries.length == 1) {
    return 'Only ${readerSummaryProviderLabel(entries.single.providerKey)} contributed cited evidence.';
  }

  final itemCount = entries.fold<int>(
    0,
    (count, entry) => count + entry.itemCount,
  );
  final labels = entries
      .take(3)
      .map((entry) => readerSummaryProviderLabel(entry.providerKey))
      .join(', ');
  final suffix = entries.length > 3 ? ' +${entries.length - 3} more' : '';

  return 'Sources: $labels$suffix. $itemCount cited items.';
}

String _readerSummaryDisplayText(String value) {
  return value
      .trim()
      .replaceAll('story/stories', 'stories')
      .replaceAll('a analytical', 'an analytical')
      .replaceAll('Top links', 'Top reads');
}

class _SummaryHeader extends StatelessWidget {
  const _SummaryHeader({
    required this.title,
    required this.isRefreshing,
    required this.freshnessLabel,
    required this.isDegraded,
  });

  final String title;
  final bool isRefreshing;
  final String freshnessLabel;
  final bool isDegraded;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.auto_awesome_outlined),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
        ),
        AppStatusBadge(
          label: isRefreshing ? 'Refreshing' : freshnessLabel,
          tone: isDegraded ? AppStatusTone.warning : AppStatusTone.success,
        ),
      ],
    );
  }
}

class _BulletList extends StatelessWidget {
  const _BulletList({required this.items});

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: items
          .map(
            (item) => Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Padding(
                    padding: EdgeInsets.only(top: 6),
                    child: Icon(Icons.circle, size: 6),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(child: Text(item, maxLines: 3)),
                ],
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}
