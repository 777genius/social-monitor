import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../stores/interests_form_store.dart';

class InterestEditorPanel extends StatelessWidget {
  const InterestEditorPanel({
    super.key,
    required this.store,
    required this.onSaved,
  });

  final InterestsFormStore store;
  final Future<void> Function() onSaved;

  @override
  Widget build(BuildContext context) {
    if (!store.isOpen && store.state is! FailureViewState<InterestSummary>) {
      return const SizedBox.shrink();
    }

    final title = switch (store.mode) {
      InterestEditorMode.create => 'Create interest',
      InterestEditorMode.edit => 'Edit interest',
      InterestEditorMode.closed => 'Interest workflow',
    };
    final failure = switch (store.state) {
      FailureViewState<InterestSummary>(:final failure) => failure,
      _ => null,
    };

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(title, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              key: const ValueKey('interest-name-field'),
              controller: TextEditingController(
                text: store.name,
              )..selection = TextSelection.collapsed(offset: store.name.length),
              decoration: const InputDecoration(labelText: 'Interest name'),
              onChanged: store.updateName,
            ),
            const SizedBox(height: AppSpacing.sm),
            TextField(
              key: const ValueKey('interest-query-field'),
              controller: TextEditingController(text: store.queryText)
                ..selection = TextSelection.collapsed(
                  offset: store.queryText.length,
                ),
              decoration: const InputDecoration(
                labelText: 'Query',
                hintText: 'pricing OR launch',
              ),
              onChanged: store.updateQueryText,
            ),
            if (failure != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: AppInlineProblem(
                  title: 'Interest validation',
                  message: failure.message,
                  tone: AppProblemTone.warning,
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            AppCommandBar(
              actions: [
                AppCommandAction(
                  label: 'Cancel',
                  icon: Icons.close,
                  variant: AppButtonVariant.secondary,
                  onPressed: store.close,
                ),
                AppCommandAction(
                  label: 'Save interest',
                  icon: Icons.save_outlined,
                  onPressed: store.saveIntent.isEnabled
                      ? () async {
                          final result = await store.save();
                          if (result is ResultSuccess<InterestSummary>) {
                            await onSaved();
                          }
                        }
                      : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
