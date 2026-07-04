import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/reader_summary.dart';
import '../../domain/entities/post_rating.dart';
import '../../domain/entities/reader_summary_job_snapshot.dart';
import '../../domain/value_objects/reader_action_target.dart';
import 'reader_summary_view.dart';
import 'workspace_summary_period_shell.dart';
import 'workspace_summary_skeleton.dart';
import 'workspace_summary_status_cards.dart';

class WorkspaceSummaryPanel extends StatelessWidget {
  const WorkspaceSummaryPanel({
    super.key,
    required this.state,
    required this.jobState,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.selectedPeriod,
    required this.selectedPeriodPreset,
    required this.availableSummaryPeriods,
    required this.canNavigateToPreviousPeriod,
    required this.canNavigateToNextPeriod,
    required this.isCurrentPeriod,
    required this.onPeriodChanged,
    required this.onPreviousPeriod,
    required this.onCurrentPeriod,
    required this.onNextPeriod,
    required this.onCalendarDateSelected,
    required this.onRetry,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    required this.topPostRatingFor,
    required this.onTopPostRating,
    required this.onOpenUrl,
  });

  final AsyncViewState<WorkspaceSummarySnapshot> state;
  final AsyncViewState<ReaderSummaryJobSnapshot> jobState;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final SummaryPeriod selectedPeriod;
  final SummaryPeriodPreset selectedPeriodPreset;
  final List<SummaryPeriod> availableSummaryPeriods;
  final bool canNavigateToPreviousPeriod;
  final bool canNavigateToNextPeriod;
  final bool isCurrentPeriod;
  final ValueChanged<SummaryPeriodPreset> onPeriodChanged;
  final VoidCallback onPreviousPeriod;
  final VoidCallback onCurrentPeriod;
  final VoidCallback onNextPeriod;
  final ValueChanged<DateTime> onCalendarDateSelected;
  final VoidCallback onRetry;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderSummary summary, ReaderAction action)
  intentForAction;
  final void Function(
    ReaderSummary summary,
    ReaderAction action, [
    ReaderFeedbackReason? feedbackReason,
  ])
  onAction;
  final int? Function(ReaderSummary summary, TopRead item) topPostRatingFor;
  final Future<bool> Function(
    ReaderSummary summary,
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )
  onTopPostRating;
  final void Function(ReaderSummary summary, String url) onOpenUrl;

  @override
  Widget build(BuildContext context) {
    if (jobState is LoadingViewState<ReaderSummaryJobSnapshot>) {
      final current = _currentSummary(state);
      if (current != null) {
        return _withPeriodShell(
          _ReadySummary(
            summary: current,
            isRefreshing: true,
            readerActionState: readerActionState,
            activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
            lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
            onGenerate: onGenerate,
            intentForAction: intentForAction,
            onAction: onAction,
            topPostRatingFor: topPostRatingFor,
            onTopPostRating: onTopPostRating,
            onOpenUrl: onOpenUrl,
          ),
          isGenerating: true,
          exportSummary: current,
        );
      }
      return _withPeriodShell(const _GeneratingSummary(), isGenerating: true);
    }
    final failedJob = _failedJob(jobState);
    if (failedJob != null) {
      return _withPeriodShell(
        AppInlineProblem(
          title: 'Summary generation failed',
          message: failedJob.failureReason ?? 'The summary job failed.',
          tone: AppProblemTone.warning,
          actionLabel: 'Generate',
          onAction: onGenerate,
        ),
      );
    }
    final activeJob = _activeJob(jobState);
    if (activeJob != null) {
      final current = _currentSummary(state);
      if (current != null) {
        return _withPeriodShell(
          _ReadySummary(
            summary: current,
            isRefreshing: true,
            readerActionState: readerActionState,
            activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
            lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
            onGenerate: onGenerate,
            intentForAction: intentForAction,
            onAction: onAction,
            topPostRatingFor: topPostRatingFor,
            onTopPostRating: onTopPostRating,
            onOpenUrl: onOpenUrl,
          ),
          isGenerating: true,
          exportSummary: current,
        );
      }
      return _withPeriodShell(
        _GeneratingSummary(job: activeJob),
        isGenerating: true,
      );
    }
    if (jobState case FailureViewState<ReaderSummaryJobSnapshot>(
      :final failure,
    )) {
      return _withPeriodShell(
        AppInlineProblem(
          title: 'Summary request failed',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Generate',
          onAction: onGenerate,
        ),
      );
    }

    final body = switch (state) {
      ReadyViewState<WorkspaceSummarySnapshot>(:final value) =>
        value.current == null
            ? _EmptySummary(onGenerate: onGenerate)
            : _ReadySummary(
                summary: value.current!,
                readerActionState: readerActionState,
                activeReaderActionIdempotencyKey:
                    activeReaderActionIdempotencyKey,
                lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
                onGenerate: onGenerate,
                intentForAction: intentForAction,
                onAction: onAction,
                topPostRatingFor: topPostRatingFor,
                onTopPostRating: onTopPostRating,
                onOpenUrl: onOpenUrl,
              ),
      LoadingViewState<WorkspaceSummarySnapshot>(:final previousValue) =>
        previousValue?.current == null
            ? const _SummarySkeleton()
            : _ReadySummary(
                summary: previousValue!.current!,
                isRefreshing: true,
                readerActionState: readerActionState,
                activeReaderActionIdempotencyKey:
                    activeReaderActionIdempotencyKey,
                lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
                onGenerate: onGenerate,
                intentForAction: intentForAction,
                onAction: onAction,
                topPostRatingFor: topPostRatingFor,
                onTopPostRating: onTopPostRating,
                onOpenUrl: onOpenUrl,
              ),
      FailureViewState<WorkspaceSummarySnapshot>(:final failure) =>
        AppInlineProblem(
          title: 'Summary unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: onRetry,
        ),
      EmptyViewState<WorkspaceSummarySnapshot>() => _EmptySummary(
        onGenerate: onGenerate,
      ),
      _ => const SizedBox.shrink(),
    };
    return _withPeriodShell(body, exportSummary: _currentSummary(state));
  }

  Widget _withPeriodShell(
    Widget child, {
    bool isGenerating = false,
    ReaderSummary? exportSummary,
  }) {
    return WorkspaceSummaryPeriodShell(
      selectedPeriod: selectedPeriod,
      selectedPreset: selectedPeriodPreset,
      availableSummaryPeriods: availableSummaryPeriods,
      canNavigateToPreviousPeriod: canNavigateToPreviousPeriod,
      canNavigateToNextPeriod: canNavigateToNextPeriod,
      isCurrentPeriod: isCurrentPeriod,
      onPeriodChanged: onPeriodChanged,
      onPreviousPeriod: onPreviousPeriod,
      onCurrentPeriod: onCurrentPeriod,
      onNextPeriod: onNextPeriod,
      onCalendarDateSelected: onCalendarDateSelected,
      onGenerate: onGenerate,
      isGenerating: isGenerating,
      exportSummary: exportSummary,
      child: child,
    );
  }

  ReaderSummaryJobSnapshot? _activeJob(
    AsyncViewState<ReaderSummaryJobSnapshot> state,
  ) {
    return switch (state) {
      LoadingViewState<ReaderSummaryJobSnapshot>(:final previousValue) =>
        previousValue?.status.isPending == true ? previousValue : null,
      ReadyViewState<ReaderSummaryJobSnapshot>(:final value)
          when value.status.isPending =>
        value,
      _ => null,
    };
  }

  ReaderSummaryJobSnapshot? _failedJob(
    AsyncViewState<ReaderSummaryJobSnapshot> state,
  ) {
    return switch (state) {
      ReadyViewState<ReaderSummaryJobSnapshot>(:final value)
          when value.status == ReaderSummaryJobStatus.failed =>
        value,
      _ => null,
    };
  }

  ReaderSummary? _currentSummary(
    AsyncViewState<WorkspaceSummarySnapshot> state,
  ) {
    return switch (state) {
      ReadyViewState<WorkspaceSummarySnapshot>(:final value) => value.current,
      LoadingViewState<WorkspaceSummarySnapshot>(:final previousValue) =>
        previousValue?.current,
      _ => null,
    };
  }
}

class _ReadySummary extends StatelessWidget {
  const _ReadySummary({
    required this.summary,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    required this.topPostRatingFor,
    required this.onTopPostRating,
    required this.onOpenUrl,
    this.isRefreshing = false,
  });

  final ReaderSummary summary;
  final AsyncViewState<ReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(ReaderSummary summary, ReaderAction action)
  intentForAction;
  final void Function(
    ReaderSummary summary,
    ReaderAction action, [
    ReaderFeedbackReason? feedbackReason,
  ])
  onAction;
  final int? Function(ReaderSummary summary, TopRead item) topPostRatingFor;
  final Future<bool> Function(
    ReaderSummary summary,
    TopRead item,
    int rating,
    PostRatingReason? reason,
  )
  onTopPostRating;
  final void Function(ReaderSummary summary, String url) onOpenUrl;
  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    return ReaderSummaryView(
      summary: summary,
      isRefreshing: isRefreshing,
      readerActionState: readerActionState,
      activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
      lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
      onGenerate: onGenerate,
      intentForAction: (action) => intentForAction(summary, action),
      onAction: (action, [feedbackReason]) =>
          onAction(summary, action, feedbackReason),
      topPostRatingFor: (item) => topPostRatingFor(summary, item),
      onTopPostRating: (item, rating, reason) =>
          onTopPostRating(summary, item, rating, reason),
      onOpenUrl: (url) => onOpenUrl(summary, url),
    );
  }
}

class _EmptySummary extends StatelessWidget {
  const _EmptySummary({required this.onGenerate});

  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    return WorkspaceSummaryEmptyCard(onGenerate: onGenerate);
  }
}

class _GeneratingSummary extends StatelessWidget {
  const _GeneratingSummary({this.job});

  final ReaderSummaryJobSnapshot? job;

  @override
  Widget build(BuildContext context) {
    final status = switch (job?.status) {
      ReaderSummaryJobStatus.requested => 'Queued',
      ReaderSummaryJobStatus.running => 'Running',
      ReaderSummaryJobStatus.completed => 'Completed',
      ReaderSummaryJobStatus.noSignal => 'No signal',
      ReaderSummaryJobStatus.failed => 'Failed',
      ReaderSummaryJobStatus.unknown => 'Unknown',
      null => 'Starting',
    };
    return WorkspaceSummaryGeneratingCard(statusLabel: status);
  }
}

class _SummarySkeleton extends StatelessWidget {
  const _SummarySkeleton();

  @override
  Widget build(BuildContext context) {
    return const WorkspaceSummarySkeleton();
  }
}
