import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

import '../../domain/value_objects/summary_period.dart';

/// Friendly empty state shown when the selected period has no summary yet.
class WorkspaceSummaryEmptyCard extends StatelessWidget {
  const WorkspaceSummaryEmptyCard({
    super.key,
    required this.periodPreset,
    required this.onGenerate,
  });

  final SummaryPeriodPreset periodPreset;
  final VoidCallback onGenerate;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return _StatusCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.09),
              shape: BoxShape.circle,
            ),
            child: SizedBox.square(
              dimension: 56,
              child: Icon(
                Icons.auto_awesome_outlined,
                size: 26,
                color: colorScheme.primary,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            _title,
            textAlign: TextAlign.center,
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs + 2),
          Text(
            _message,
            textAlign: TextAlign.center,
            style: textTheme.bodySmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              height: 1.45,
            ),
          ),
          const SizedBox(height: AppSpacing.md + 4),
          FilledButton.icon(
            key: const ValueKey('workspace-summary-empty-generate'),
            onPressed: onGenerate,
            icon: const Icon(Icons.auto_awesome_outlined, size: 17),
            label: const Text('Generate'),
          ),
        ],
      ),
    );
  }

  String get _title => switch (periodPreset) {
    SummaryPeriodPreset.weekly => 'No weekly summary for this period',
    SummaryPeriodPreset.monthly => 'No monthly summary for this period',
    SummaryPeriodPreset.daily ||
    SummaryPeriodPreset.twoWeeks ||
    SummaryPeriodPreset.threeWeeks => 'No workspace summary',
  };

  String get _message => switch (periodPreset) {
    SummaryPeriodPreset.weekly =>
      'Run a weekly summary after feed items are collected.',
    SummaryPeriodPreset.monthly =>
      'Run a monthly summary after feed items are collected.',
    SummaryPeriodPreset.daily ||
    SummaryPeriodPreset.twoWeeks ||
    SummaryPeriodPreset.threeWeeks =>
      'Run a workspace summary after feed items are collected.',
  };
}

/// Progress card shown while a summary job is queued or running.
class WorkspaceSummaryGeneratingCard extends StatelessWidget {
  const WorkspaceSummaryGeneratingCard({super.key, required this.statusLabel});

  final String statusLabel;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return _StatusCard(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              color: colorScheme.primary.withValues(alpha: 0.09),
              shape: BoxShape.circle,
            ),
            child: SizedBox.square(
              dimension: 56,
              child: Icon(
                Icons.auto_awesome,
                size: 26,
                color: colorScheme.primary,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Generating summary',
            textAlign: TextAlign.center,
            style: textTheme.titleMedium?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: AppSpacing.xs + 2),
          Text(
            '$statusLabel - collecting the latest workspace signal.',
            textAlign: TextAlign.center,
            style: textTheme.bodySmall?.copyWith(
              color: colorScheme.onSurfaceVariant,
              height: 1.45,
            ),
          ),
          const SizedBox(height: AppSpacing.md + 4),
          const SizedBox(
            width: 220,
            child: ClipRRect(
              borderRadius: BorderRadius.all(Radius.circular(999)),
              child: LinearProgressIndicator(minHeight: 5),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: colorScheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.xxl,
        ),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: child,
          ),
        ),
      ),
    );
  }
}
