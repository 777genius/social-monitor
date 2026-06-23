import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../formatters/source_binding_display_formatters.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import 'scan_policy_panel.dart';
import 'scan_run_panel.dart';

class SourceBindingDetailPanel extends StatelessWidget {
  const SourceBindingDetailPanel({
    super.key,
    required this.store,
    required this.policyStore,
    required this.scanRunStore,
    required this.binding,
  });

  final SourceBindingsStore store;
  final ScanPolicyStore policyStore;
  final ScanRunStore scanRunStore;
  final SourceBinding binding;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppEntityHeader(
          title: sourceBindingTitle(binding),
          subtitle: sourceBindingPreview(binding),
          status: AppStatusBadge(
            label: sourceBindingStatusLabel(binding.status),
            tone: sourceBindingStatusTone(binding.status),
          ),
          metadata: [
            AppEntityMetadata(
              label: 'Provider',
              value: sourceProviderLabel(binding.providerKey),
            ),
            AppEntityMetadata(label: 'Binding ID', value: binding.id.value),
          ],
          actions: AppCommandBar(
            actions: [
              AppCommandAction(
                label: 'Pause',
                icon: Icons.pause_circle_outline,
                variant: AppButtonVariant.secondary,
                onPressed: store.pauseIntentFor(binding).isEnabled
                    ? () => unawaited(store.pause(binding))
                    : null,
              ),
              AppCommandAction(
                label: 'Resume',
                icon: Icons.play_circle_outline,
                variant: AppButtonVariant.secondary,
                onPressed: store.resumeIntentFor(binding).isEnabled
                    ? () => unawaited(store.resume(binding))
                    : null,
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        _ConfigPreview(binding: binding),
        const SizedBox(height: AppSpacing.md),
        _HealthSummary(state: store.healthState),
        const SizedBox(height: AppSpacing.md),
        ScanPolicyPanel(store: policyStore),
        const SizedBox(height: AppSpacing.md),
        ScanRunPanel(store: scanRunStore),
        const SizedBox(height: AppSpacing.md),
        AppInlineProblem(
          title: 'Provider access',
          message: sourceBindingBackendNote(binding),
          tone: AppProblemTone.neutral,
        ),
      ],
    );
  }
}

class _ConfigPreview extends StatelessWidget {
  const _ConfigPreview({required this.binding});

  final SourceBinding binding;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Configuration',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: 0,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final item in binding.configPreview)
              _DetailRow(label: item.key, value: item.value),
          ],
        ),
      ),
    );
  }
}

class _HealthSummary extends StatelessWidget {
  const _HealthSummary({required this.state});

  final AsyncViewState<SourceBindingHealthSnapshot> state;

  @override
  Widget build(BuildContext context) {
    return switch (state) {
      ReadyViewState<SourceBindingHealthSnapshot>(:final value) =>
        _ReadyHealthSummary(snapshot: value),
      LoadingViewState<SourceBindingHealthSnapshot>() => const AppInlineProblem(
        title: 'Loading health',
        message: 'Checking source binding health.',
        tone: AppProblemTone.neutral,
      ),
      FailureViewState<SourceBindingHealthSnapshot>(:final failure) =>
        AppInlineProblem(
          title: 'Health unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
        ),
      _ => const AppInlineProblem(
        title: 'Health summary',
        message: 'Select a binding to load operational health.',
        tone: AppProblemTone.neutral,
      ),
    };
  }
}

class _ReadyHealthSummary extends StatelessWidget {
  const _ReadyHealthSummary({required this.snapshot});

  final SourceBindingHealthSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final scan = snapshot.latestScan;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
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
                    'Health summary',
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                AppStatusBadge(
                  label: sourceBindingHealthLabel(snapshot.healthState),
                  tone: sourceBindingHealthTone(snapshot.healthState),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            _DetailRow(
              label: 'Operator action',
              value: snapshot.operatorAction,
            ),
            _DetailRow(
              label: 'Evaluated',
              value: sourceBindingEvaluatedLabel(snapshot),
            ),
            if (scan != null) ...[
              const SizedBox(height: AppSpacing.sm),
              _DetailRow(label: 'Latest scan', value: scan.status),
              _DetailRow(label: 'User state', value: scan.userState),
              _DetailRow(label: 'Fetched', value: '${scan.fetched ?? 0}'),
              _DetailRow(label: 'Inserted', value: '${scan.inserted ?? 0}'),
              _DetailRow(
                label: 'Duplicates',
                value: '${scan.skippedDuplicates ?? 0}',
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({required this.label, required this.value});

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
