import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_coverage_plan.dart';
import '../../domain/entities/source_binding.dart';
import '../../domain/value_objects/interest_coverage_plan_draft_status.dart';
import '../formatters/source_binding_display_formatters.dart';
import '../stores/interest_coverage_plan_store.dart';
import '../stores/source_bindings_store.dart';
import 'interest_coverage_source_pack_controls.dart';

class InterestCoveragePlanPanel extends StatelessWidget {
  const InterestCoveragePlanPanel({
    super.key,
    required this.store,
    required this.bindingsStore,
  });

  final InterestCoveragePlanStore store;
  final SourceBindingsStore bindingsStore;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: Listenable.merge([store, bindingsStore]),
      builder: (context, child) {
        return DecoratedBox(
          decoration: BoxDecoration(
            border: Border.all(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: _PanelBody(store: store, bindingsStore: bindingsStore),
          ),
        );
      },
    );
  }
}

class _PanelBody extends StatelessWidget {
  const _PanelBody({required this.store, required this.bindingsStore});

  final InterestCoveragePlanStore store;
  final SourceBindingsStore bindingsStore;

  @override
  Widget build(BuildContext context) {
    final state = store.planState;
    final isLoading = state is LoadingViewState<InterestCoveragePlan>;
    final previous = switch (state) {
      LoadingViewState<InterestCoveragePlan>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    final readyPlan = switch (state) {
      ReadyViewState<InterestCoveragePlan>(:final value) => value,
      _ => previous,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Recommended sources',
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                  Text(
                    'For ${store.interestTitle}',
                    style: Theme.of(context).textTheme.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            AppButton(
              key: const ValueKey('coverage-plan-refresh-button'),
              label: isLoading ? 'Planning' : 'Plan',
              icon: Icons.auto_awesome,
              variant: AppButtonVariant.secondary,
              onPressed: isLoading || !store.planIntent.isEnabled
                  ? null
                  : () => unawaited(store.plan()),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        InterestCoverageSourcePackSelector(store: store, isLoading: isLoading),
        const SizedBox(height: AppSpacing.sm),
        switch (state) {
          InitialViewState<InterestCoveragePlan>() => const Text(
            'Build Reddit, Hacker News and RSS drafts for this interest.',
          ),
          FailureViewState<InterestCoveragePlan>(:final failure) =>
            AppInlineProblem(
              title: 'Coverage plan unavailable',
              message: failure.message,
              tone: AppProblemTone.warning,
              actionLabel: 'Retry',
              onAction: () => unawaited(store.plan()),
            ),
          EmptyViewState<InterestCoveragePlan>() => const AppInlineProblem(
            title: 'No source drafts',
            message: 'No production-safe coverage plan is available yet.',
            tone: AppProblemTone.neutral,
          ),
          _ => _PlanContent(
            plan: readyPlan,
            isLoading: isLoading,
            bindingsStore: bindingsStore,
          ),
        },
      ],
    );
  }
}

class _PlanContent extends StatelessWidget {
  const _PlanContent({
    required this.plan,
    required this.isLoading,
    required this.bindingsStore,
  });

  final InterestCoveragePlan? plan;
  final bool isLoading;
  final SourceBindingsStore bindingsStore;

  @override
  Widget build(BuildContext context) {
    final value = plan;
    if (value == null) {
      return const SizedBox.shrink();
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (isLoading) ...[
          const LinearProgressIndicator(minHeight: 3),
          const SizedBox(height: AppSpacing.sm),
        ],
        Text(
          value.planningQuery,
          style: Theme.of(context).textTheme.bodySmall,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        if (value.sourcePack case final sourcePack?) ...[
          const SizedBox(height: AppSpacing.sm),
          InterestCoverageSourcePackSummary(sourcePack: sourcePack),
        ],
        if (value.coverageGaps.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          AppInlineProblem(
            title: 'Coverage gaps',
            message: value.coverageGaps.join('\n'),
            tone: AppProblemTone.warning,
          ),
        ],
        const SizedBox(height: AppSpacing.md),
        ...value.drafts.map(
          (draft) => Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.sm),
            child: _DraftTile(draft: draft, bindingsStore: bindingsStore),
          ),
        ),
      ],
    );
  }
}

class _DraftTile extends StatelessWidget {
  const _DraftTile({required this.draft, required this.bindingsStore});

  final InterestCoveragePlanDraft draft;
  final SourceBindingsStore bindingsStore;

  @override
  Widget build(BuildContext context) {
    final mutationInFlight =
        bindingsStore.mutationState is LoadingViewState<SourceBinding>;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(sourceBindingProviderIcon(draft.providerKey), size: 20),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        draft.displayName,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                      Text(
                        _draftSubtitle(draft),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                AppStatusBadge(
                  label: _statusLabel(draft.status),
                  tone: _statusTone(draft.status),
                ),
              ],
            ),
            if (draft.warnings.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                draft.warnings.first,
                style: Theme.of(context).textTheme.bodySmall,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(
                  child: Wrap(
                    spacing: AppSpacing.xs,
                    runSpacing: AppSpacing.xs,
                    children: [
                      AppStatusBadge(
                        label: 'Confidence ${draft.confidenceScore}/10',
                      ),
                      if (draft.cadenceSuggestion case final cadence?)
                        AppStatusBadge(
                          label: '${cadence.intervalSeconds.round()}s cadence',
                        ),
                    ],
                  ),
                ),
                AppButton(
                  key: ValueKey(
                    'coverage-plan-apply-${draft.providerKey.normalized}',
                  ),
                  label:
                      draft.status ==
                          InterestCoveragePlanDraftStatus.alreadyBound
                      ? 'Bound'
                      : 'Apply',
                  icon: Icons.add_link,
                  variant: AppButtonVariant.secondary,
                  onPressed: draft.canApply && !mutationInFlight
                      ? () => unawaited(
                          bindingsStore.applyInterestCoveragePlanDraft(draft),
                        )
                      : null,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _draftSubtitle(InterestCoveragePlanDraft draft) {
    if (draft.rationale.isNotEmpty) {
      return draft.rationale.first;
    }
    return draft.queryModes.join(', ');
  }

  String _statusLabel(InterestCoveragePlanDraftStatus status) {
    return switch (status) {
      InterestCoveragePlanDraftStatus.ready => 'Ready',
      InterestCoveragePlanDraftStatus.needsInput => 'Needs input',
      InterestCoveragePlanDraftStatus.alreadyBound => 'Bound',
      InterestCoveragePlanDraftStatus.unsupported => 'Unsupported',
      InterestCoveragePlanDraftStatus.unknown => 'Unknown',
    };
  }

  AppStatusTone _statusTone(InterestCoveragePlanDraftStatus status) {
    return switch (status) {
      InterestCoveragePlanDraftStatus.ready => AppStatusTone.success,
      InterestCoveragePlanDraftStatus.needsInput => AppStatusTone.warning,
      InterestCoveragePlanDraftStatus.alreadyBound => AppStatusTone.neutral,
      InterestCoveragePlanDraftStatus.unsupported => AppStatusTone.danger,
      InterestCoveragePlanDraftStatus.unknown => AppStatusTone.neutral,
    };
  }
}
