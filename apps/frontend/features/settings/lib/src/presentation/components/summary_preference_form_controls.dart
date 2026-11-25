import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/summary_preference.dart';
import '../stores/summary_preference_store.dart';

class SummaryPreferencePanelShell extends StatelessWidget {
  const SummaryPreferencePanelShell({
    super.key,
    required this.title,
    required this.statusLabel,
    required this.child,
  });

  final String title;
  final String statusLabel;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colorScheme.surface,
        border: Border.all(
          color: dark ? AppColors.darkBorder : AppColors.border,
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.auto_awesome_outlined, color: colorScheme.primary),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0,
                    ),
                  ),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: colorScheme.primary.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.sm,
                      vertical: AppSpacing.xs,
                    ),
                    child: Text(
                      statusLabel,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                        color: colorScheme.primary,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            child,
          ],
        ),
      ),
    );
  }
}

class SummaryPreferenceSelector<T extends Object> extends StatelessWidget {
  const SummaryPreferenceSelector({
    super.key,
    required this.label,
    required this.selected,
    required this.segments,
    required this.onChanged,
  });

  final String label;
  final T selected;
  final List<ButtonSegment<T>> segments;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
            fontWeight: FontWeight.w800,
            letterSpacing: 0,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: SegmentedButton<T>(
            showSelectedIcon: false,
            segments: segments,
            selected: {selected},
            onSelectionChanged: (selection) => onChanged(selection.first),
          ),
        ),
      ],
    );
  }
}

class SummaryPreferenceSwitch extends StatelessWidget {
  const SummaryPreferenceSwitch({
    super.key,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile.adaptive(
      contentPadding: EdgeInsets.zero,
      title: Text(title),
      subtitle: Text(subtitle),
      value: value,
      onChanged: onChanged,
    );
  }
}

class SummaryPreferenceFooter extends StatelessWidget {
  const SummaryPreferenceFooter({
    super.key,
    required this.store,
    required this.onSave,
  });

  final SummaryPreferenceStore store;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final validationFailure = store.validationFailure;
    final saveFailure = switch (store.saveState) {
      FailureViewState<SummaryPreference>(:final failure) => failure,
      _ => null,
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (validationFailure != null || saveFailure != null) ...[
          const SizedBox(height: AppSpacing.sm),
          AppInlineProblem(
            title: validationFailure != null
                ? 'Prompt is too long'
                : 'Summary style was not saved',
            message: (validationFailure ?? saveFailure)!.message,
            tone: AppProblemTone.warning,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        AppCommandBar(
          actions: [
            AppCommandAction(
              label: 'Save summary style',
              icon: Icons.save_outlined,
              controlKeyBase: 'settings-summary-preference-save',
              enabled: store.saveIntent.isEnabled,
              reason: store.saveIntent.disabledReasonCode,
              onPressed: onSave,
            ),
            AppCommandAction(
              label: 'Reset draft',
              icon: Icons.restart_alt_outlined,
              controlKeyBase: 'settings-summary-preference-reset',
              variant: AppButtonVariant.secondary,
              onPressed: store.resetDraft,
            ),
          ],
        ),
      ],
    );
  }
}
