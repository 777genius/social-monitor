import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../components/github_mark.dart';
import '../components/workspace_briefing_panel.dart';
import '../stores/summaries_review_store.dart';

class SummariesFeaturePage extends StatefulWidget {
  const SummariesFeaturePage({
    super.key,
    required this.store,
    this.autoload = true,
  });

  final SummariesReviewStore store;
  final bool autoload;

  @override
  State<SummariesFeaturePage> createState() => _SummariesFeaturePageState();
}

class _SummariesFeaturePageState extends State<SummariesFeaturePage> {
  @override
  void initState() {
    super.initState();
    if (widget.autoload) {
      unawaited(widget.store.load());
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AnimatedBuilder(
        animation: widget.store,
        builder: (context, child) {
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: const AppSectionHeader(
                  eyebrow: 'Intelligence',
                  title: 'Summaries',
                  description:
                      'Review the workspace summary, source coverage and saved summary history.',
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _SummariesBody(store: widget.store),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _SummariesBody extends StatelessWidget {
  const _SummariesBody({required this.store});

  final SummariesReviewStore store;

  @override
  Widget build(BuildContext context) {
    final state = store.listState;
    final items = switch (state) {
      ReadyViewState<PageResult<GeneratedSummary>>(:final value) => value.items,
      LoadingViewState<PageResult<GeneratedSummary>>(:final previousValue) =>
        previousValue?.items ?? const <GeneratedSummary>[],
      _ => const <GeneratedSummary>[],
    };
    final isCompact = AppScreenClass.of(context).isCompact;
    final selected = store.selectedSummary ?? items.firstOrNull;
    final detailSummary = isCompact && !store.hasExplicitSelection
        ? null
        : selected;
    final showSummaryHistory =
        items.isNotEmpty ||
        state is LoadingViewState<PageResult<GeneratedSummary>> ||
        state is FailureViewState<PageResult<GeneratedSummary>>;

    final content = switch (state) {
      FailureViewState<PageResult<GeneratedSummary>>(:final failure) =>
        AppInlineProblem(
          title: 'Summaries unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      EmptyViewState<PageResult<GeneratedSummary>>() => const AppInlineProblem(
        title: 'No summaries',
        message: 'Generate a workspace summary after posts are collected.',
        tone: AppProblemTone.neutral,
      ),
      _ => AppResponsiveSplitView(
        list: AppDataList<GeneratedSummary>(
          items: items,
          stableId: (summary) => summary.id.value,
          isLoading: state is LoadingViewState<PageResult<GeneratedSummary>>,
          emptyTitle: 'No summaries',
          emptyMessage:
              'Generate a workspace summary after posts are collected.',
          itemBuilder: (context, summary, index) {
            return ListTile(
              selected: detailSummary?.id == summary.id,
              leading: const Icon(Icons.summarize_outlined),
              title: Text(summary.title),
              subtitle: Text('${summary.citations.length} citations'),
              trailing: AppStatusBadge(
                label: _statusLabel(summary.status),
                tone: _statusTone(summary.status),
              ),
              onTap: () => unawaited(store.selectSummary(summary.id)),
            );
          },
        ),
        detailTitle: detailSummary?.title ?? 'Summary detail',
        onCloseDetail: isCompact ? store.clearSelection : null,
        detail: detailSummary == null
            ? isCompact
                  ? null
                  : const AppInlineProblem(
                      title: 'Select a summary',
                      message: 'Choose a summary to review citations.',
                      tone: AppProblemTone.neutral,
                    )
            : _SummaryDetail(store: store, summary: detailSummary),
      ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WorkspaceBriefingPanel(
          state: store.briefingState,
          jobState: store.briefingJobState,
          readerActionState: store.readerActionState,
          activeReaderActionIdempotencyKey:
              store.activeReaderActionIdempotencyKey,
          lastReaderActionIdempotencyKey: store.lastReaderActionIdempotencyKey,
          onRetry: () => unawaited(store.loadWorkspaceBriefing()),
          onGenerate: () => unawaited(store.requestWorkspaceBriefing()),
          intentForAction: store.readerActionIntentFor,
          onAction: (briefing, action, [feedbackReason]) => unawaited(
            store.submitReaderAction(briefing, action, feedbackReason),
          ),
        ),
        if (showSummaryHistory) ...[
          const SizedBox(height: AppSpacing.md),
          content,
        ],
      ],
    );
  }
}

class _SummaryDetail extends StatelessWidget {
  const _SummaryDetail({required this.store, required this.summary});

  final SummariesReviewStore store;
  final GeneratedSummary summary;

  @override
  Widget build(BuildContext context) {
    final detailState = store.detailState;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppEntityHeader(
          title: summary.title,
          subtitle: summary.bodyPreview,
          status: AppStatusBadge(
            label: _statusLabel(summary.status),
            tone: _statusTone(summary.status),
          ),
          metadata: [
            AppEntityMetadata(
              label: 'Citations',
              value: '${summary.citations.length}',
            ),
            AppEntityMetadata(
              label: 'Freshness',
              value: summary.freshnessLabel,
            ),
          ],
        ),
        if (summary.status == SummaryGenerationStatus.degraded) ...[
          const SizedBox(height: AppSpacing.md),
          const AppInlineProblem(
            title: 'Degraded summary',
            message: 'Some evidence is unavailable. Review citations first.',
            tone: AppProblemTone.warning,
          ),
        ],
        if (detailState is FailureViewState<GeneratedSummary>) ...[
          const SizedBox(height: AppSpacing.md),
          AppInlineProblem(
            title: 'Summary detail unavailable',
            message: detailState.failure.message,
            tone: AppProblemTone.warning,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        const AppInlineProblem(
          title: 'Citation safety',
          message:
              'Summary details expose citation ids and safe snippets, not raw provider payload dumps.',
        ),
        const SizedBox(height: AppSpacing.md),
        AppDataList<SummaryCitation>(
          items: summary.citations,
          stableId: (citation) => citation.id,
          emptyTitle: 'No citations',
          emptyMessage: 'This summary does not expose supporting evidence yet.',
          itemBuilder: (context, citation, index) {
            return _CitationTile(citation: citation);
          },
        ),
        const SizedBox(height: AppSpacing.md),
        AppCommandBar(
          actions: [
            AppCommandAction(
              label: 'Regenerate',
              icon: Icons.refresh,
              variant: AppButtonVariant.secondary,
              onPressed: store.regenerationIntentFor(summary).isEnabled
                  ? () => unawaited(store.regenerate(summary))
                  : null,
            ),
            AppCommandAction(
              label: 'Helpful',
              icon: Icons.thumb_up_outlined,
              onPressed:
                  store
                      .feedbackIntentFor(summary, SummaryFeedbackKind.helpful)
                      .isEnabled
                  ? () => unawaited(
                      store.submitFeedback(
                        summary,
                        SummaryFeedbackKind.helpful,
                      ),
                    )
                  : null,
            ),
            AppCommandAction(
              label: 'Needs work',
              icon: Icons.rate_review_outlined,
              variant: AppButtonVariant.secondary,
              onPressed:
                  store
                      .feedbackIntentFor(summary, SummaryFeedbackKind.needsWork)
                      .isEnabled
                  ? () => unawaited(
                      store.submitFeedback(
                        summary,
                        SummaryFeedbackKind.needsWork,
                      ),
                    )
                  : null,
            ),
          ],
        ),
      ],
    );
  }
}

class _CitationTile extends StatelessWidget {
  const _CitationTile({required this.citation});

  final SummaryCitation citation;

  @override
  Widget build(BuildContext context) {
    final isGitHub = _isGitHubCitation(citation);
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: dark ? AppColors.darkSurfaceMuted : AppColors.surfaceMuted,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: isGitHub
                    ? const GitHubMark(size: 18)
                    : const Icon(Icons.link_outlined, size: 18),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      citation.sourceLabel,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      citation.safeSnippet,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: dark
                            ? AppColors.darkTextMuted
                            : AppColors.textMuted,
                        letterSpacing: 0,
                      ),
                    ),
                    if (citation.canonicalUrl != null) ...[
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        citation.canonicalUrl!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: Theme.of(context).colorScheme.primary,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

bool _isGitHubCitation(SummaryCitation citation) {
  final label = citation.sourceLabel.toLowerCase();
  final url = citation.canonicalUrl?.toLowerCase();
  return label.contains('github') ||
      label.contains('repo radar') ||
      url?.contains('github.com') == true;
}

String _statusLabel(SummaryGenerationStatus status) {
  return switch (status) {
    SummaryGenerationStatus.ready => 'Ready',
    SummaryGenerationStatus.generating => 'Generating',
    SummaryGenerationStatus.degraded => 'Degraded',
    SummaryGenerationStatus.failed => 'Failed',
    SummaryGenerationStatus.unknown => 'Unknown',
  };
}

AppStatusTone _statusTone(SummaryGenerationStatus status) {
  return switch (status) {
    SummaryGenerationStatus.ready => AppStatusTone.success,
    SummaryGenerationStatus.generating => AppStatusTone.neutral,
    SummaryGenerationStatus.degraded => AppStatusTone.warning,
    SummaryGenerationStatus.failed => AppStatusTone.danger,
    SummaryGenerationStatus.unknown => AppStatusTone.neutral,
  };
}
