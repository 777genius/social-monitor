import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/weekly_summary_projection.dart';
import '../components/weekly_summary_projection_panel.dart';
import '../components/weekly_summary_week_controls.dart';
import '../formatters/weekly_summary_projection_text.dart';
import '../stores/weekly_summaries_store.dart';

class WeeklySummariesFeaturePage extends StatefulWidget {
  const WeeklySummariesFeaturePage({super.key, required this.store});

  final WeeklySummariesStore store;

  @override
  State<WeeklySummariesFeaturePage> createState() =>
      _WeeklySummariesFeaturePageState();
}

class _WeeklySummariesFeaturePageState extends State<WeeklySummariesFeaturePage> {
  @override
  void initState() {
    super.initState();
    unawaited(widget.store.load());
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.store,
      builder: (context, _) {
        final state = widget.store.state;
        return AppPageSurface(
          child: SingleChildScrollView(
            key: const PageStorageKey<String>('weekly-summary-scroll-view'),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppSectionHeader(
                  eyebrow: 'Certified reporting',
                  title: 'Weekly summary',
                  description:
                      'Review a Monday–Sunday UTC projection with only certified evidence, full provenance, and source citations.',
                  trailing: _stateBadge(state),
                ),
                const SizedBox(height: AppSpacing.lg),
                WeeklySummaryWeekControls(
                  week: widget.store.week,
                  onPreviousWeek: () =>
                      unawaited(widget.store.showPreviousWeek()),
                  onNextWeek: () => unawaited(widget.store.showNextWeek()),
                  onRetry: () => unawaited(widget.store.retry()),
                ),
                const SizedBox(height: AppSpacing.lg),
                if (state is LoadingViewState<WeeklySummaryProjection> ||
                    state is RetryingViewState<WeeklySummaryProjection>) ...[
                  Semantics(
                    liveRegion: true,
                    label: 'Loading weekly summary',
                    child: LinearProgressIndicator(),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
                _stateBody(
                  state,
                  onRetry: () => unawaited(widget.store.retry()),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

AppStatusBadge _stateBadge(AsyncViewState<WeeklySummaryProjection> state) {
  return switch (state) {
    ReadyViewState<WeeklySummaryProjection>(:final value) => AppStatusBadge(
      label: weeklySummaryStatusLabel(value.status),
      tone: value.status == WeeklySummaryProjectionStatus.complete
          ? AppStatusTone.success
          : AppStatusTone.warning,
    ),
    LoadingViewState<WeeklySummaryProjection>() ||
    RetryingViewState<WeeklySummaryProjection>() =>
      const AppStatusBadge(label: 'Loading'),
    FailureViewState<WeeklySummaryProjection>() =>
      const AppStatusBadge(label: 'Needs retry', tone: AppStatusTone.danger),
    PermissionRequiredViewState<WeeklySummaryProjection>() =>
      const AppStatusBadge(label: 'Access required', tone: AppStatusTone.warning),
    InitialViewState<WeeklySummaryProjection>() ||
    EmptyViewState<WeeklySummaryProjection>() =>
      const AppStatusBadge(label: 'Preparing'),
  };
}

Widget _stateBody(
  AsyncViewState<WeeklySummaryProjection> state, {
  required VoidCallback onRetry,
}) {
  return switch (state) {
    ReadyViewState<WeeklySummaryProjection>(:final value) =>
      WeeklySummaryProjectionPanel(projection: value),
    InitialViewState<WeeklySummaryProjection>() ||
    LoadingViewState<WeeklySummaryProjection>() ||
    RetryingViewState<WeeklySummaryProjection>() => const SizedBox(
      height: 220,
      child: Center(child: CircularProgressIndicator()),
    ),
    EmptyViewState<WeeklySummaryProjection>(:final reason) => AppEmptyState(
      title: 'No weekly projection',
      message: reason,
      icon: Icons.calendar_today_outlined,
      action: AppButton(label: 'Retry', onPressed: onRetry),
    ),
    FailureViewState<WeeklySummaryProjection>(:final failure) =>
      AppInlineProblem(
        title: 'Weekly summary unavailable',
        message: failure.message,
        tone: AppProblemTone.warning,
        actionLabel: 'Retry',
        onAction: onRetry,
      ),
    PermissionRequiredViewState<WeeklySummaryProjection>(
      :final permissionKey,
      :final message,
    ) =>
      AppPermissionRepairSurface(
        title: 'Summary access required',
        message: message,
        reasonCode: permissionKey,
        actionLabel: 'Retry',
        onAction: onRetry,
      ),
  };
}
