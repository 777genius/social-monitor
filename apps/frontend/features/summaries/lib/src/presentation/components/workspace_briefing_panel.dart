import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/briefing_job_snapshot.dart';
import '../../domain/entities/generated_briefing.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
import 'reader_briefing_view.dart';

class WorkspaceBriefingPanel extends StatelessWidget {
  const WorkspaceBriefingPanel({
    super.key,
    required this.state,
    required this.jobState,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onRetry,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
  });

  final AsyncViewState<WorkspaceBriefingSnapshot> state;
  final AsyncViewState<BriefingJobSnapshot> jobState;
  final AsyncViewState<BriefingReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onRetry;
  final VoidCallback onGenerate;
  final UserActionIntent Function(
    GeneratedBriefing briefing,
    BriefingNextAction action,
  )
  intentForAction;
  final void Function(
    GeneratedBriefing briefing,
    BriefingNextAction action, [
    BriefingReaderFeedbackReason? feedbackReason,
  ])
  onAction;

  @override
  Widget build(BuildContext context) {
    if (jobState is LoadingViewState<BriefingJobSnapshot>) {
      final current = _currentBriefing(state);
      if (current != null) {
        return _ReadyBriefing(
          briefing: current,
          isRefreshing: true,
          readerActionState: readerActionState,
          activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
          lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
          onGenerate: onGenerate,
          intentForAction: intentForAction,
          onAction: onAction,
        );
      }
      return const _GeneratingBriefing();
    }
    final failedJob = _failedJob(jobState);
    if (failedJob != null) {
      return AppInlineProblem(
        title: 'Summary generation failed',
        message: failedJob.failureReason ?? 'The summary job failed.',
        tone: AppProblemTone.warning,
        actionLabel: 'Generate',
        onAction: onGenerate,
      );
    }
    final activeJob = _activeJob(jobState);
    if (activeJob != null) {
      final current = _currentBriefing(state);
      if (current != null) {
        return _ReadyBriefing(
          briefing: current,
          isRefreshing: true,
          readerActionState: readerActionState,
          activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
          lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
          onGenerate: onGenerate,
          intentForAction: intentForAction,
          onAction: onAction,
        );
      }
      return _GeneratingBriefing(job: activeJob);
    }
    if (jobState case FailureViewState<BriefingJobSnapshot>(:final failure)) {
      return AppInlineProblem(
        title: 'Summary request failed',
        message: failure.message,
        tone: AppProblemTone.warning,
        actionLabel: 'Generate',
        onAction: onGenerate,
      );
    }

    return switch (state) {
      ReadyViewState<WorkspaceBriefingSnapshot>(:final value) =>
        value.current == null
            ? _EmptyBriefing(onGenerate: onGenerate)
            : _ReadyBriefing(
                briefing: value.current!,
                readerActionState: readerActionState,
                activeReaderActionIdempotencyKey:
                    activeReaderActionIdempotencyKey,
                lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
                onGenerate: onGenerate,
                intentForAction: intentForAction,
                onAction: onAction,
              ),
      LoadingViewState<WorkspaceBriefingSnapshot>(:final previousValue) =>
        previousValue?.current == null
            ? const _BriefingSkeleton()
            : _ReadyBriefing(
                briefing: previousValue!.current!,
                isRefreshing: true,
                readerActionState: readerActionState,
                activeReaderActionIdempotencyKey:
                    activeReaderActionIdempotencyKey,
                lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
                onGenerate: onGenerate,
                intentForAction: intentForAction,
                onAction: onAction,
              ),
      FailureViewState<WorkspaceBriefingSnapshot>(:final failure) =>
        AppInlineProblem(
          title: 'Summary unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: onRetry,
        ),
      EmptyViewState<WorkspaceBriefingSnapshot>() => _EmptyBriefing(
        onGenerate: onGenerate,
      ),
      _ => const SizedBox.shrink(),
    };
  }

  BriefingJobSnapshot? _activeJob(AsyncViewState<BriefingJobSnapshot> state) {
    return switch (state) {
      LoadingViewState<BriefingJobSnapshot>(:final previousValue) =>
        previousValue?.status.isPending == true ? previousValue : null,
      ReadyViewState<BriefingJobSnapshot>(:final value)
          when value.status.isPending =>
        value,
      _ => null,
    };
  }

  BriefingJobSnapshot? _failedJob(AsyncViewState<BriefingJobSnapshot> state) {
    return switch (state) {
      ReadyViewState<BriefingJobSnapshot>(:final value)
          when value.status == BriefingJobStatus.failed =>
        value,
      _ => null,
    };
  }

  GeneratedBriefing? _currentBriefing(
    AsyncViewState<WorkspaceBriefingSnapshot> state,
  ) {
    return switch (state) {
      ReadyViewState<WorkspaceBriefingSnapshot>(:final value) => value.current,
      LoadingViewState<WorkspaceBriefingSnapshot>(:final previousValue) =>
        previousValue?.current,
      _ => null,
    };
  }
}

class _ReadyBriefing extends StatelessWidget {
  const _ReadyBriefing({
    required this.briefing,
    required this.readerActionState,
    required this.activeReaderActionIdempotencyKey,
    required this.lastReaderActionIdempotencyKey,
    required this.onGenerate,
    required this.intentForAction,
    required this.onAction,
    this.isRefreshing = false,
  });

  final GeneratedBriefing briefing;
  final AsyncViewState<BriefingReaderActionResult> readerActionState;
  final String? activeReaderActionIdempotencyKey;
  final String? lastReaderActionIdempotencyKey;
  final VoidCallback onGenerate;
  final UserActionIntent Function(
    GeneratedBriefing briefing,
    BriefingNextAction action,
  )
  intentForAction;
  final void Function(
    GeneratedBriefing briefing,
    BriefingNextAction action, [
    BriefingReaderFeedbackReason? feedbackReason,
  ])
  onAction;
  final bool isRefreshing;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: ReaderBriefingView(
          briefing: briefing,
          isRefreshing: isRefreshing,
          readerActionState: readerActionState,
          activeReaderActionIdempotencyKey: activeReaderActionIdempotencyKey,
          lastReaderActionIdempotencyKey: lastReaderActionIdempotencyKey,
          onGenerate: onGenerate,
          intentForAction: (action) => intentForAction(briefing, action),
          onAction: (action, [feedbackReason]) =>
              onAction(briefing, action, feedbackReason),
        ),
      ),
    );
  }
}

class _EmptyBriefing extends StatelessWidget {
  const _EmptyBriefing({required this.onGenerate});

  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    return AppInlineProblem(
      title: 'No workspace summary',
      message: 'Run a workspace summary after feed items are collected.',
      tone: AppProblemTone.neutral,
      actionLabel: 'Generate',
      onAction: onGenerate,
    );
  }
}

class _GeneratingBriefing extends StatelessWidget {
  const _GeneratingBriefing({this.job});

  final BriefingJobSnapshot? job;

  @override
  Widget build(BuildContext context) {
    final status = switch (job?.status) {
      BriefingJobStatus.requested => 'Queued',
      BriefingJobStatus.running => 'Running',
      BriefingJobStatus.completed => 'Completed',
      BriefingJobStatus.noSignal => 'No signal',
      BriefingJobStatus.failed => 'Failed',
      BriefingJobStatus.unknown => 'Unknown',
      null => 'Starting',
    };
    return AppInlineProblem(
      title: 'Generating summary',
      message: '$status - collecting the latest workspace signal.',
      tone: AppProblemTone.neutral,
    );
  }
}

class _BriefingSkeleton extends StatelessWidget {
  const _BriefingSkeleton();

  @override
  Widget build(BuildContext context) {
    return const AppInlineProblem(
      title: 'Loading summary',
      message: 'Fetching the latest workspace summary.',
      tone: AppProblemTone.neutral,
    );
  }
}
