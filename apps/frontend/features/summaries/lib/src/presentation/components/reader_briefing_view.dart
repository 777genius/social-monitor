import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_briefing.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
import 'reader_briefing_coverage_summary.dart';
import 'reader_briefing_next_actions.dart';
import 'reader_briefing_provider_label.dart';
import 'reader_briefing_quality_summary.dart';
import 'reader_briefing_sections.dart';
import 'reader_briefing_top_reads.dart';

const _maxVisibleTopReads = 10;

class ReaderBriefingView extends StatelessWidget {
  const ReaderBriefingView({
    super.key,
    required this.briefing,
    required this.isRefreshing,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
  });

  final GeneratedBriefing briefing;
  final bool isRefreshing;
  final AsyncViewState<BriefingReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(BriefingNextAction action) intentForAction;
  final BriefingReaderActionSelected onAction;

  @override
  Widget build(BuildContext context) {
    final readerBrief = briefing.readerBrief;
    final citationsById = {
      for (final citation in briefing.citations) citation.id: citation,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _BriefingHeader(
          title: readerBrief.headline,
          isRefreshing: isRefreshing,
          freshnessLabel: briefing.freshnessLabel,
          isDegraded: briefing.isDegraded,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          _readerBriefingDisplayText(readerBrief.oneLineTakeaway),
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
            height: 1.45,
            fontWeight: FontWeight.w600,
            letterSpacing: 0,
          ),
        ),
        if (readerBrief.bullets.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          _BulletList(
            items: readerBrief.bullets
                .take(4)
                .map(_readerBriefingDisplayText)
                .toList(),
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        _EvidenceStrip(
          sourceMix: readerBrief.sourceMix,
          citationCount: briefing.citations.length,
          topReadCount: readerBrief.topReads.length,
        ),
        if (readerBrief.nextActions.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          ReaderBriefingNextActions(
            actions: readerBrief.nextActions.take(5).toList(),
            actionState: readerActionState,
            activeActionIdempotencyKey: activeReaderActionIdempotencyKey,
            lastActionIdempotencyKey: lastReaderActionIdempotencyKey,
            intentForAction: intentForAction,
            onAction: onAction,
          ),
        ],
        if (readerBrief.topReads.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          ReaderBriefingTopReads(
            items: readerBrief.topReads.take(_maxVisibleTopReads).toList(),
            citationsById: citationsById,
          ),
        ],
        if (_hasEvidenceAndQuality(readerBrief, briefing.isDegraded)) ...[
          const SizedBox(height: AppSpacing.md),
          _EvidenceAndQualityDisclosure(
            readerBrief: readerBrief,
            isDegraded: briefing.isDegraded,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        AppCommandBar(
          actions: [
            AppCommandAction(
              label: isRefreshing ? 'Generating' : 'Regenerate',
              icon: Icons.auto_awesome_outlined,
              controlKeyBase: 'workspace-briefing-generate',
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

  bool _hasTrendDelta(BriefingTrendDelta delta) {
    return delta.newSignals.isNotEmpty ||
        delta.growingSignals.isNotEmpty ||
        delta.repeatedSignals.isNotEmpty ||
        delta.fadingSignals.isNotEmpty;
  }

  bool _hasQualitySignal(
    BriefingReaderQualityState qualityState,
    bool isDegraded,
  ) {
    return isDegraded ||
        qualityState.status != 'ready' ||
        qualityState.warnings.isNotEmpty ||
        qualityState.isSingleSource;
  }

  bool _hasEvidenceAndQuality(
    BriefingReaderBrief readerBrief,
    bool isDegraded,
  ) {
    return _hasQualitySignal(readerBrief.qualityState, isDegraded) ||
        readerBrief.sourceMix.isNotEmpty ||
        readerBrief.topicSections.isNotEmpty ||
        _hasTrendDelta(readerBrief.trendDelta) ||
        readerBrief.openQuestions.isNotEmpty ||
        readerBrief.risks.isNotEmpty;
  }
}

class _EvidenceAndQualityDisclosure extends StatelessWidget {
  const _EvidenceAndQualityDisclosure({
    required this.readerBrief,
    required this.isDegraded,
  });

  final BriefingReaderBrief readerBrief;
  final bool isDegraded;

  @override
  Widget build(BuildContext context) {
    return ReaderBriefingSection(
      title: 'Evidence and quality',
      icon: Icons.fact_check_outlined,
      child: Theme(
        data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
        child: ExpansionTile(
          key: const ValueKey('reader-brief-evidence-quality'),
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
            if (_hasQualitySignal(readerBrief.qualityState, isDegraded)) ...[
              ReaderBriefingQualitySummary(
                qualityState: readerBrief.qualityState,
                isDegraded: isDegraded,
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (readerBrief.sourceMix.isNotEmpty) ...[
              ReaderBriefingCoverageSummary(entries: readerBrief.sourceMix),
              const SizedBox(height: AppSpacing.md),
            ],
            if (readerBrief.topicSections.isNotEmpty) ...[
              ReaderBriefingTopicSections(
                sections: readerBrief.topicSections.take(3).toList(),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
            if (_hasTrendDelta(readerBrief.trendDelta)) ...[
              ReaderBriefingTrendDelta(delta: readerBrief.trendDelta),
              const SizedBox(height: AppSpacing.md),
            ],
            if (readerBrief.openQuestions.isNotEmpty ||
                readerBrief.risks.isNotEmpty)
              ReaderBriefingWatchouts(
                questions: readerBrief.openQuestions,
                risks: readerBrief.risks,
              ),
          ],
        ),
      ),
    );
  }

  bool _hasTrendDelta(BriefingTrendDelta delta) {
    return delta.newSignals.isNotEmpty ||
        delta.growingSignals.isNotEmpty ||
        delta.repeatedSignals.isNotEmpty ||
        delta.fadingSignals.isNotEmpty;
  }

  bool _hasQualitySignal(
    BriefingReaderQualityState qualityState,
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

  final List<BriefingSourceMixEntry> sourceMix;
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
                    '${readerBriefingProviderLabel(entry.providerKey)} ${entry.itemCount}',
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

String _sourceMixText(List<BriefingSourceMixEntry> entries) {
  if (entries.isEmpty) {
    return 'No cited source mix is available yet.';
  }

  if (entries.length == 1) {
    return 'Only ${readerBriefingProviderLabel(entries.single.providerKey)} contributed cited evidence.';
  }

  final itemCount = entries.fold<int>(
    0,
    (count, entry) => count + entry.itemCount,
  );
  final labels = entries
      .take(3)
      .map((entry) => readerBriefingProviderLabel(entry.providerKey))
      .join(', ');
  final suffix = entries.length > 3 ? ' +${entries.length - 3} more' : '';

  return 'Sources: $labels$suffix. $itemCount cited items.';
}

String _readerBriefingDisplayText(String value) {
  return value
      .trim()
      .replaceAll('story/stories', 'stories')
      .replaceAll('a analytical', 'an analytical')
      .replaceAll('Top links', 'Top reads');
}

class _BriefingHeader extends StatelessWidget {
  const _BriefingHeader({
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
