import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_request.dart';
import '../../domain/entities/scan_status_snapshot.dart';
import '../formatters/scan_run_display_formatters.dart';
import '../stores/scan_run_store.dart';

class ScanRunPanel extends StatelessWidget {
  const ScanRunPanel({super.key, required this.store});

  final ScanRunStore store;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: store,
      builder: (context, child) {
        final request = switch (store.requestState) {
          ReadyViewState<ScanRequest>(:final value) => value,
          _ => null,
        };
        final requestFailure = switch (store.requestState) {
          FailureViewState<ScanRequest>(:final failure) => failure,
          _ => null,
        };
        final status = switch (store.statusState) {
          ReadyViewState<ScanStatusSnapshot>(:final value) => value,
          LoadingViewState<ScanStatusSnapshot>(:final previousValue) =>
            previousValue,
          _ => null,
        };
        final statusFailure = switch (store.statusState) {
          FailureViewState<ScanStatusSnapshot>(:final failure) => failure,
          _ => null,
        };

        return DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        'Scan run',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    if (status != null)
                      AppStatusBadge(
                        label: scanUserStateLabel(status.userState),
                        tone: scanStatusTone(status.status, status.userState),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.sm),
                AppCommandBar(
                  actions: [
                    AppCommandAction(
                      label: store.isRequesting ? 'Starting' : 'Start scan',
                      icon: Icons.play_circle_outline,
                      onPressed:
                          store.startScanIntent.isEnabled && !store.isRequesting
                          ? () => unawaited(store.requestScan())
                          : null,
                    ),
                  ],
                ),
                if (request != null && status == null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  _ScanRow(label: 'Scan job', value: request.scanJobId.value),
                  _ScanRow(
                    label: 'Status',
                    value: scanJobStatusLabel(request.status),
                  ),
                ],
                if (store.statusState
                    is LoadingViewState<ScanStatusSnapshot>) ...[
                  const SizedBox(height: AppSpacing.sm),
                  const AppInlineProblem(
                    title: 'Loading status',
                    message: 'Checking the scan job status.',
                    tone: AppProblemTone.neutral,
                  ),
                ],
                if (status != null) ...[
                  const SizedBox(height: AppSpacing.md),
                  _StatusSummary(status: status),
                ],
                if (requestFailure != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppInlineProblem(
                    title: 'Scan request failed',
                    message: requestFailure.message,
                    tone: AppProblemTone.warning,
                  ),
                ],
                if (statusFailure != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppInlineProblem(
                    title: 'Status unavailable',
                    message: statusFailure.message,
                    tone: AppProblemTone.warning,
                    actionLabel: 'Retry',
                    onAction: () => unawaited(store.retryStatus()),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

class _StatusSummary extends StatelessWidget {
  const _StatusSummary({required this.status});

  final ScanStatusSnapshot status;

  @override
  Widget build(BuildContext context) {
    final attempt = status.latestAttempt;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ScanRow(label: 'Scan job', value: status.scanJobId.value),
        _ScanRow(label: 'Status', value: scanJobStatusLabel(status.status)),
        _ScanRow(label: 'Operator action', value: status.operatorAction),
        _ScanRow(
          label: 'Requested',
          value: status.requestedAt.toIso8601String(),
        ),
        if (status.completedAt != null)
          _ScanRow(
            label: 'Completed',
            value: status.completedAt!.toIso8601String(),
          ),
        if (status.failureClass != null)
          _ScanRow(
            label: 'Failure class',
            value: scanFailureClassLabel(status.failureClass!),
          ),
        if (status.failureReason != null)
          _ScanRow(label: 'Failure reason', value: status.failureReason!),
        if (attempt != null) ...[
          const SizedBox(height: AppSpacing.sm),
          _ScanRow(
            label: 'Attempt',
            value: scanAttemptStatusLabel(attempt.status),
          ),
          _CounterGrid(
            fetched: attempt.fetched,
            inserted: attempt.inserted,
            skippedDuplicates: attempt.skippedDuplicates,
            projected: attempt.projected,
          ),
        ],
      ],
    );
  }
}

class _CounterGrid extends StatelessWidget {
  const _CounterGrid({
    required this.fetched,
    required this.inserted,
    required this.skippedDuplicates,
    required this.projected,
  });

  final int fetched;
  final int inserted;
  final int skippedDuplicates;
  final int projected;

  @override
  Widget build(BuildContext context) {
    final counters = [
      ('Fetched', fetched),
      ('Inserted', inserted),
      ('Duplicates', skippedDuplicates),
      ('Projected', projected),
    ];
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: counters
          .map(
            (counter) => DecoratedBox(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      counter.$1,
                      style: Theme.of(
                        context,
                      ).textTheme.bodySmall?.copyWith(letterSpacing: 0),
                    ),
                    Text(
                      '${counter.$2}',
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          )
          .toList(growable: false),
    );
  }
}

class _ScanRow extends StatelessWidget {
  const _ScanRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(letterSpacing: 0),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
                letterSpacing: 0,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
