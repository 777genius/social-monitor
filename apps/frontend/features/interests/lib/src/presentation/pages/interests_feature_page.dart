import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/interest_summary.dart';
import '../../domain/value_objects/interest_lifecycle_status.dart';
import '../components/interest_editor_panel.dart';
import '../stores/interests_form_store.dart';
import '../stores/interests_list_store.dart';

class InterestsFeaturePage extends StatefulWidget {
  const InterestsFeaturePage({
    super.key,
    required this.store,
    required this.formStore,
    this.autoload = true,
    this.showLifecycleFilters = true,
    this.showEditArchiveActions = true,
    this.onOpenInterestSources,
  });

  final InterestsListStore store;
  final InterestsFormStore formStore;
  final bool autoload;
  final bool showLifecycleFilters;
  final bool showEditArchiveActions;
  final void Function(String interestId, String interestTitle)?
  onOpenInterestSources;

  @override
  State<InterestsFeaturePage> createState() => _InterestsFeaturePageState();
}

class _InterestsFeaturePageState extends State<InterestsFeaturePage> {
  @override
  void initState() {
    super.initState();
    if (widget.autoload) {
      unawaited(widget.store.load());
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppPageSurface(
      child: AnimatedBuilder(
        animation: widget.store,
        builder: (context, child) {
          return CustomScrollView(
            slivers: [
              SliverToBoxAdapter(
                child: AppSectionHeader(
                  eyebrow: 'Signals',
                  title: 'Interests and monitoring intents',
                  description:
                      'Create monitoring intents, tune queries and review interest coverage before connecting sources.',
                  trailing: AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Create interest',
                        icon: Icons.add,
                        onPressed: widget.store.createInterestIntent.isEnabled
                            ? widget.formStore.beginCreate
                            : null,
                      ),
                    ],
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: AppFilterBar(
                    searchValue: widget.store.search,
                    placeholder: 'Search interests',
                    onSearchChanged: (value) {
                      unawaited(widget.store.updateSearch(value));
                    },
                    filters: widget.showLifecycleFilters
                        ? [
                            AppFilterChipData(
                              label: 'Active',
                              selected:
                                  widget.store.status ==
                                  InterestLifecycleStatus.active,
                              onSelected: (selected) {
                                unawaited(
                                  widget.store.updateStatus(
                                    selected
                                        ? InterestLifecycleStatus.active
                                        : null,
                                  ),
                                );
                              },
                            ),
                            AppFilterChipData(
                              label: 'Draft',
                              selected:
                                  widget.store.status ==
                                  InterestLifecycleStatus.draft,
                              onSelected: (selected) {
                                unawaited(
                                  widget.store.updateStatus(
                                    selected
                                        ? InterestLifecycleStatus.draft
                                        : null,
                                  ),
                                );
                              },
                            ),
                          ]
                        : const [],
                    onClear: () {
                      unawaited(widget.store.updateSearch(''));
                      unawaited(widget.store.updateStatus(null));
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: AnimatedBuilder(
                    animation: widget.formStore,
                    builder: (context, child) {
                      return InterestEditorPanel(
                        store: widget.formStore,
                        onSaved: widget.store.load,
                      );
                    },
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.md),
                  child: _InterestsBody(
                    store: widget.store,
                    formStore: widget.formStore,
                    showEditArchiveActions: widget.showEditArchiveActions,
                    onOpenInterestSources: widget.onOpenInterestSources,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _InterestsBody extends StatelessWidget {
  const _InterestsBody({
    required this.store,
    required this.formStore,
    required this.showEditArchiveActions,
    required this.onOpenInterestSources,
  });

  final InterestsListStore store;
  final InterestsFormStore formStore;
  final bool showEditArchiveActions;
  final void Function(String interestId, String interestTitle)?
  onOpenInterestSources;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final items = switch (state) {
      ReadyViewState<PageResult<InterestSummary>>(:final value) => value.items,
      LoadingViewState<PageResult<InterestSummary>>(:final previousValue) =>
        previousValue?.items ?? const <InterestSummary>[],
      _ => const <InterestSummary>[],
    };
    final selected = store.selectedInterest ?? items.firstOrNull;

    return switch (state) {
      FailureViewState<PageResult<InterestSummary>>(:final failure) =>
        AppInlineProblem(
          title: 'Interests unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      PermissionRequiredViewState<PageResult<InterestSummary>>(
        :final permissionKey,
        :final message,
      ) =>
        AppPermissionRepairSurface(
          title: 'Interest permission required',
          message: message,
          reasonCode: permissionKey,
          actionLabel: 'Refresh interests',
          onAction: () => unawaited(store.load()),
        ),
      EmptyViewState<PageResult<InterestSummary>>() => AppInlineProblem(
        title: store.search.trim().isNotEmpty || store.status != null
            ? 'No interests match these filters'
            : 'No interests yet',
        message: store.search.trim().isNotEmpty || store.status != null
            ? 'Clear filters to return to all monitoring intents.'
            : 'Create an interest to start collecting posts.',
        tone: AppProblemTone.neutral,
        actionLabel: store.search.trim().isNotEmpty || store.status != null
            ? 'Clear filters'
            : null,
        onAction: store.search.trim().isNotEmpty || store.status != null
            ? () {
                unawaited(store.updateSearch(''));
                unawaited(store.updateStatus(null));
              }
            : null,
      ),
      _ => AppResponsiveSplitView(
        list: AppDataList<InterestSummary>(
          items: items,
          stableId: (interest) => interest.id.value,
          isLoading: state is LoadingViewState<PageResult<InterestSummary>>,
          emptyTitle: 'No interests',
          emptyMessage: store.search.trim().isNotEmpty || store.status != null
              ? 'Clear filters to return to all monitoring intents.'
              : 'Create an interest to start collecting posts.',
          itemBuilder: (context, interest, index) {
            return ListTile(
              selected: selected?.id == interest.id,
              title: Text(interest.name.value),
              subtitle: Text(
                '${interest.weeklyMentionCount} mentions this week',
              ),
              trailing: AppStatusBadge(label: _statusLabel(interest.status)),
              onTap: () => store.selectInterest(interest.id),
            );
          },
        ),
        detailTitle: selected?.name.value ?? 'Interest detail',
        detail: selected == null
            ? const AppInlineProblem(
                title: 'Select an interest',
                message: 'Choose a monitoring intent to review its coverage.',
                tone: AppProblemTone.neutral,
              )
            : AppEntityHeader(
                title: selected.name.value,
                subtitle: selected.query.value,
                status: AppStatusBadge(
                  label: _statusLabel(selected.status),
                  tone: selected.status == InterestLifecycleStatus.active
                      ? AppStatusTone.success
                      : AppStatusTone.neutral,
                ),
                metadata: [
                  AppEntityMetadata(
                    label: 'Mentions',
                    value: '${selected.weeklyMentionCount}',
                  ),
                  AppEntityMetadata(
                    label: 'Query',
                    value: selected.query.value,
                  ),
                ],
                actions: showEditArchiveActions || onOpenInterestSources != null
                    ? AppCommandBar(
                        actions: [
                          if (onOpenInterestSources != null)
                            AppCommandAction(
                              label: 'Sources',
                              icon: Icons.hub_outlined,
                              variant: AppButtonVariant.secondary,
                              onPressed: () => onOpenInterestSources!(
                                selected.id.value,
                                selected.name.value,
                              ),
                            ),
                          if (showEditArchiveActions) ...[
                            AppCommandAction(
                              label: 'Edit',
                              icon: Icons.edit_outlined,
                              onPressed: () => formStore.beginEdit(selected),
                            ),
                            AppCommandAction(
                              label: 'Archive',
                              icon: Icons.archive_outlined,
                              variant: AppButtonVariant.secondary,
                              onPressed:
                                  store.archiveIntentFor(selected).isEnabled
                                  ? () async {
                                      final result = await formStore.archive(
                                        selected,
                                      );
                                      if (result
                                          is ResultSuccess<InterestSummary>) {
                                        await store.load();
                                      }
                                    }
                                  : null,
                            ),
                          ],
                        ],
                      )
                    : null,
              ),
      ),
    };
  }
}

String _statusLabel(InterestLifecycleStatus status) {
  return switch (status) {
    InterestLifecycleStatus.active => 'Active',
    InterestLifecycleStatus.draft => 'Draft',
    InterestLifecycleStatus.archived => 'Archived',
    InterestLifecycleStatus.unknown => 'Unknown',
  };
}
