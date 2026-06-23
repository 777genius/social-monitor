import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/briefing_job_snapshot.dart';
import '../../domain/entities/generated_briefing.dart';

class WorkspaceBriefingPanel extends StatelessWidget {
  const WorkspaceBriefingPanel({
    super.key,
    required this.state,
    required this.jobState,
    required this.onRetry,
    required this.onGenerate,
  });

  final AsyncViewState<WorkspaceBriefingSnapshot> state;
  final AsyncViewState<BriefingJobSnapshot> jobState;
  final VoidCallback onRetry;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    if (jobState is LoadingViewState<BriefingJobSnapshot>) {
      final current = _currentBriefing(state);
      if (current != null) {
        return _ReadyBriefing(
          briefing: current,
          isRefreshing: true,
          onGenerate: onGenerate,
        );
      }
      return const _GeneratingBriefing();
    }
    final failedJob = _failedJob(jobState);
    if (failedJob != null) {
      return AppInlineProblem(
        title: 'Briefing generation failed',
        message: failedJob.failureReason ?? 'The briefing job failed.',
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
          onGenerate: onGenerate,
        );
      }
      return _GeneratingBriefing(job: activeJob);
    }
    if (jobState case FailureViewState<BriefingJobSnapshot>(:final failure)) {
      return AppInlineProblem(
        title: 'Briefing request failed',
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
            : _ReadyBriefing(briefing: value.current!, onGenerate: onGenerate),
      LoadingViewState<WorkspaceBriefingSnapshot>(:final previousValue) =>
        previousValue?.current == null
            ? const _BriefingSkeleton()
            : _ReadyBriefing(
                briefing: previousValue!.current!,
                isRefreshing: true,
                onGenerate: onGenerate,
              ),
      FailureViewState<WorkspaceBriefingSnapshot>(:final failure) =>
        AppInlineProblem(
          title: 'Briefing unavailable',
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
    required this.onGenerate,
    this.isRefreshing = false,
  });

  final GeneratedBriefing briefing;
  final VoidCallback onGenerate;
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.auto_awesome_outlined),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    briefing.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                AppStatusBadge(
                  label: isRefreshing ? 'Refreshing' : briefing.freshnessLabel,
                  tone: briefing.isDegraded
                      ? AppStatusTone.warning
                      : AppStatusTone.success,
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              briefing.executiveSummary,
              style: Theme.of(
                context,
              ).textTheme.bodyMedium?.copyWith(height: 1.45, letterSpacing: 0),
            ),
            if (briefing.topStories.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: briefing.topStories
                    .take(3)
                    .map((story) => _StoryChip(story: story))
                    .toList(growable: false),
              ),
            ],
            if (briefing.repeatedSignals.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              _RepeatedSignal(signal: briefing.repeatedSignals.first),
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
                      ? 'Workspace briefing generation is already running'
                      : null,
                  onPressed: onGenerate,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StoryChip extends StatelessWidget {
  const _StoryChip({required this.story});

  final BriefingStory story;

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 180, maxWidth: 280),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.sm),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                story.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0,
                ),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                '${story.topicCount} topics - ${story.providerCount} providers',
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RepeatedSignal extends StatelessWidget {
  const _RepeatedSignal({required this.signal});

  final BriefingRepeatedSignal signal;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Icon(Icons.hub_outlined, size: 18),
        const SizedBox(width: AppSpacing.xs),
        Expanded(
          child: Text(
            '${signal.title} (${signal.topicIds.length} topics)',
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    );
  }
}

class _EmptyBriefing extends StatelessWidget {
  const _EmptyBriefing({required this.onGenerate});

  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    return AppInlineProblem(
      title: 'No workspace briefing',
      message: 'Run a workspace briefing after feed items are collected.',
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
      title: 'Generating briefing',
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
      title: 'Loading briefing',
      message: 'Fetching the latest workspace briefing.',
      tone: AppProblemTone.neutral,
    );
  }
}
