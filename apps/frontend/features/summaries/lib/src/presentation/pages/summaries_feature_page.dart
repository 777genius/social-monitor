import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/generated_summary.dart';
import '../../domain/entities/summary_citation.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
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
                  title: 'Summaries and briefings',
                  description:
                      'Review generated briefings, citations and feedback loops with safe evidence boundaries.',
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
        message: 'Generate a briefing from reviewed mentions.',
        tone: AppProblemTone.neutral,
      ),
      _ => AppResponsiveSplitView(
        list: AppDataList<GeneratedSummary>(
          items: items,
          stableId: (summary) => summary.id.value,
          isLoading: state is LoadingViewState<PageResult<GeneratedSummary>>,
          emptyTitle: 'No summaries',
          emptyMessage: 'Generate a briefing from reviewed mentions.',
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
                      message: 'Choose a briefing to review citations.',
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
          onRetry: () => unawaited(store.loadWorkspaceBriefing()),
          onGenerate: () => unawaited(store.requestWorkspaceBriefing()),
        ),
        const SizedBox(height: AppSpacing.md),
        content,
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
            return ListTile(
              leading: const Icon(Icons.link_outlined),
              title: Text(citation.sourceLabel),
              subtitle: Text(citation.safeSnippet),
            );
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
