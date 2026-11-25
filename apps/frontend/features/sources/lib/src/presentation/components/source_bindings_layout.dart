import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/source_binding.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import 'source_binding_card.dart';
import 'source_binding_detail_panel.dart';
import 'source_binding_form_panel.dart';

class SourceBindingsLayout extends StatelessWidget {
  const SourceBindingsLayout({
    super.key,
    required this.store,
    required this.policyStore,
    required this.scanRunStore,
  });

  final SourceBindingsStore store;
  final ScanPolicyStore policyStore;
  final ScanRunStore scanRunStore;

  @override
  Widget build(BuildContext context) {
    final state = store.bindingsState;
    final items = switch (state) {
      ReadyViewState<PageResult<SourceBinding>>(:final value) => value.items,
      LoadingViewState<PageResult<SourceBinding>>(:final previousValue) =>
        previousValue?.items ?? const <SourceBinding>[],
      _ => const <SourceBinding>[],
    };
    final selected = store.selectedBinding ?? items.firstOrNull;

    return switch (state) {
      FailureViewState<PageResult<SourceBinding>>(:final failure) =>
        AppInlineProblem(
          title: 'Source bindings unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      EmptyViewState<PageResult<SourceBinding>>() => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const AppInlineProblem(
            title: 'No source bindings',
            message: 'Bind a backend-supported source to start collection.',
            tone: AppProblemTone.neutral,
          ),
          const SizedBox(height: AppSpacing.md),
          SourceBindingFormPanel(store: store),
        ],
      ),
      _ => LayoutBuilder(
        builder: (context, constraints) {
          final list = _BindingList(
            store: store,
            policyStore: policyStore,
            scanRunStore: scanRunStore,
            items: items,
            selected: selected,
            isLoading: state is LoadingViewState<PageResult<SourceBinding>>,
          );
          final detail = selected == null
              ? const AppInlineProblem(
                  title: 'Select a binding',
                  message: 'Choose a source binding to review health.',
                  tone: AppProblemTone.neutral,
                )
              : SourceBindingDetailPanel(
                  store: store,
                  policyStore: policyStore,
                  scanRunStore: scanRunStore,
                  binding: selected,
                );
          final form = SourceBindingFormPanel(store: store);

          if (constraints.maxWidth >= 1040) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(width: 360, child: list),
                const SizedBox(width: AppSpacing.lg),
                Expanded(child: detail),
                if (store.isBindFormOpen ||
                    store.mutationState is FailureViewState<SourceBinding>) ...[
                  const SizedBox(width: AppSpacing.lg),
                  SizedBox(width: 360, child: form),
                ],
              ],
            );
          }

          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              form,
              if (store.isBindFormOpen ||
                  store.mutationState is FailureViewState<SourceBinding>)
                const SizedBox(height: AppSpacing.md),
              list,
              const SizedBox(height: AppSpacing.md),
              detail,
            ],
          );
        },
      ),
    };
  }
}

class _BindingList extends StatelessWidget {
  const _BindingList({
    required this.store,
    required this.policyStore,
    required this.scanRunStore,
    required this.items,
    required this.selected,
    required this.isLoading,
  });

  final SourceBindingsStore store;
  final ScanPolicyStore policyStore;
  final ScanRunStore scanRunStore;
  final List<SourceBinding> items;
  final SourceBinding? selected;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return AppDataList<SourceBinding>(
      items: items,
      stableId: (binding) => binding.id.value,
      isLoading: isLoading,
      emptyTitle: 'No source bindings',
      emptyMessage: 'Bind a backend-supported source to start collection.',
      itemBuilder: (context, binding, index) {
        return SourceBindingCard(
          binding: binding,
          selected: selected?.id == binding.id,
          onTap: () => unawaited(_selectBinding(binding)),
        );
      },
    );
  }

  Future<void> _selectBinding(SourceBinding binding) async {
    await store.selectBinding(binding);
    await policyStore.loadFor(binding.id);
    scanRunStore.bindTo(binding.id);
  }
}
