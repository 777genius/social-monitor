import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/generated_summary.dart';
import '../components/summary_detail_panel.dart';
import '../components/summary_generation_status_presenter.dart';
import '../components/workspace_summary_panel.dart';
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
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
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
        !_hasWorkspaceSummary(store.workspaceSummaryState) &&
        (items.isNotEmpty ||
            state is LoadingViewState<PageResult<GeneratedSummary>> ||
            state is FailureViewState<PageResult<GeneratedSummary>>);

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
                label: summaryGenerationStatusLabel(summary.status),
                tone: summaryGenerationStatusTone(summary.status),
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
            : SummaryDetailPanel(store: store, summary: detailSummary),
      ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        WorkspaceSummaryPanel(
          state: store.workspaceSummaryState,
          jobState: store.summaryJobState,
          readerActionState: store.readerActionState,
          activeReaderActionIdempotencyKey:
              store.activeReaderActionIdempotencyKey,
          lastReaderActionIdempotencyKey: store.lastReaderActionIdempotencyKey,
          selectedPeriod: store.selectedSummaryPeriod,
          selectedPeriodPreset: store.selectedSummaryPeriodPreset,
          availableSummaryPeriods: store.availableWorkspaceSummaryPeriods,
          canNavigateToPreviousPeriod: store.canShowPreviousSummaryPeriod,
          canNavigateToNextPeriod: store.canShowNextSummaryPeriod,
          isCurrentPeriod: store.isSelectedSummaryPeriodCurrent,
          onPeriodChanged: (preset) =>
              unawaited(store.selectWorkspaceSummaryPeriod(preset)),
          onPreviousPeriod: () =>
              unawaited(store.showPreviousWorkspaceSummaryPeriod()),
          onCurrentPeriod: () =>
              unawaited(store.showCurrentWorkspaceSummaryPeriod()),
          onNextPeriod: () => unawaited(store.showNextWorkspaceSummaryPeriod()),
          onCalendarDateSelected: (date) =>
              unawaited(store.selectWorkspaceSummaryCalendarDate(date)),
          onRetry: () => unawaited(store.loadWorkspaceSummary()),
          onGenerate: () => unawaited(store.requestWorkspaceSummary()),
          intentForAction: store.readerActionIntentFor,
          onAction: (summary, action, [feedbackReason]) => unawaited(
            store.submitReaderAction(summary, action, feedbackReason),
          ),
          onOpenUrl: (summary, url) => unawaited(
            store.openReaderSourceUrl(summaryId: summary.id, canonicalUrl: url),
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

bool _hasWorkspaceSummary(AsyncViewState<WorkspaceSummarySnapshot> state) {
  return switch (state) {
    ReadyViewState<WorkspaceSummarySnapshot>(:final value) =>
      value.current != null,
    LoadingViewState<WorkspaceSummarySnapshot>(:final previousValue) =>
      previousValue?.current != null,
    _ => false,
  };
}
