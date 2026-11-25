import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/scan_policy.dart';
import '../formatters/scan_policy_display_formatters.dart';
import '../stores/scan_policy_store.dart';
import '../view_models/scan_policy_form_draft.dart';

class ScanPolicyPanel extends StatelessWidget {
  const ScanPolicyPanel({super.key, required this.store});

  final ScanPolicyStore store;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: store,
      builder: (context, child) {
        final policy = switch (store.policyState) {
          ReadyViewState<ScanPolicy>(:final value) => value,
          LoadingViewState<ScanPolicy>(:final previousValue) => previousValue,
          _ => null,
        };
        final loadFailure = switch (store.policyState) {
          FailureViewState<ScanPolicy>(:final failure) => failure,
          _ => null,
        };
        final saveFailure = switch (store.saveState) {
          FailureViewState<ScanPolicy>(:final failure) => failure,
          _ => null,
        };
        final validation = store.validationFailure;

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
                        'Scan policy',
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    if (policy != null)
                      AppStatusBadge(
                        label: 'Scheduled',
                        tone: AppStatusTone.success,
                      ),
                  ],
                ),
                if (policy != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  _PolicyRow(
                    label: 'Next run',
                    value: scanPolicyNextRunLabel(policy),
                  ),
                  _PolicyRow(
                    label: 'Interval',
                    value: scanPolicyCadenceLabel(policy.intervalSeconds),
                  ),
                ],
                if (store.policyState is LoadingViewState<ScanPolicy>) ...[
                  const SizedBox(height: AppSpacing.sm),
                  const AppInlineProblem(
                    title: 'Loading policy',
                    message: 'Checking scan policy for this binding.',
                    tone: AppProblemTone.neutral,
                  ),
                ],
                if (loadFailure != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppInlineProblem(
                    title: 'Policy unavailable',
                    message: loadFailure.message,
                    tone: AppProblemTone.warning,
                    actionLabel: 'Retry',
                    onAction: () => unawaited(store.retry()),
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                SegmentedButton<ScanPolicyPreset>(
                  key: const ValueKey('scan-policy-preset-control'),
                  emptySelectionAllowed: true,
                  segments: ScanPolicyPreset.values
                      .map(
                        (preset) => ButtonSegment(
                          value: preset,
                          label: Text(preset.label),
                        ),
                      )
                      .toList(growable: false),
                  selected: _selectedPreset(store),
                  onSelectionChanged: (values) {
                    final preset = values.firstOrNull;
                    if (preset != null) {
                      store.applyPreset(preset);
                    }
                  },
                ),
                const SizedBox(height: AppSpacing.sm),
                _NumberField(
                  fieldKey: 'scan-policy-interval-field',
                  label: 'Interval seconds',
                  value: store.intervalSeconds,
                  helper: 'Minimum 60 seconds',
                  onChanged: store.updateIntervalSeconds,
                ),
                const SizedBox(height: AppSpacing.sm),
                _NumberField(
                  fieldKey: 'scan-policy-freshness-field',
                  label: 'Freshness seconds',
                  value: store.freshnessSeconds,
                  helper: 'Must be greater than or equal to interval',
                  onChanged: store.updateFreshnessSeconds,
                ),
                const SizedBox(height: AppSpacing.sm),
                _NumberField(
                  fieldKey: 'scan-policy-retry-field',
                  label: 'Retry budget',
                  value: store.retryBudget,
                  helper: '0 to 10 retries',
                  onChanged: store.updateRetryBudget,
                ),
                if (validation != null || saveFailure != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppInlineProblem(
                    title: 'Policy validation',
                    message: saveFailure?.message ?? validation!.message,
                    tone: AppProblemTone.warning,
                  ),
                ],
                if (store.saveState is ReadyViewState<ScanPolicy> &&
                    policy != null) ...[
                  const SizedBox(height: AppSpacing.sm),
                  AppInlineProblem(
                    title: 'Policy saved',
                    message: 'Next run ${scanPolicyNextRunLabel(policy)}',
                    tone: AppProblemTone.neutral,
                  ),
                ],
                const SizedBox(height: AppSpacing.md),
                AppCommandBar(
                  actions: [
                    AppCommandAction(
                      label: store.isSaving ? 'Saving' : 'Save policy',
                      icon: Icons.save_outlined,
                      onPressed: store.saveIntent.isEnabled && !store.isSaving
                          ? () => unawaited(store.save())
                          : null,
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Set<ScanPolicyPreset> _selectedPreset(ScanPolicyStore store) {
    final interval = int.tryParse(store.intervalSeconds.trim());
    final freshness = int.tryParse(store.freshnessSeconds.trim());
    if (interval == null || freshness == null || interval != freshness) {
      return const {};
    }
    for (final preset in ScanPolicyPreset.values) {
      if (preset.seconds == interval) {
        return {preset};
      }
    }
    return const {};
  }
}

class _NumberField extends StatelessWidget {
  const _NumberField({
    required this.fieldKey,
    required this.label,
    required this.value,
    required this.helper,
    required this.onChanged,
  });

  final String fieldKey;
  final String label;
  final String value;
  final String helper;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      key: ValueKey(fieldKey),
      controller: TextEditingController(text: value)
        ..selection = TextSelection.collapsed(offset: value.length),
      keyboardType: TextInputType.number,
      decoration: InputDecoration(labelText: label, helperText: helper),
      onChanged: onChanged,
    );
  }
}

class _PolicyRow extends StatelessWidget {
  const _PolicyRow({required this.label, required this.value});

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
