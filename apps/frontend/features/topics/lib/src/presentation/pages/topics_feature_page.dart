import 'dart:async';

import 'package:flutter/material.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/topic_summary.dart';
import '../../domain/value_objects/topic_lifecycle_status.dart';
import '../components/topic_editor_panel.dart';
import '../stores/topics_form_store.dart';
import '../stores/topics_list_store.dart';

class TopicsFeaturePage extends StatefulWidget {
  const TopicsFeaturePage({
    super.key,
    required this.store,
    required this.formStore,
    this.autoload = true,
  });

  final TopicsListStore store;
  final TopicsFormStore formStore;
  final bool autoload;

  @override
  State<TopicsFeaturePage> createState() => _TopicsFeaturePageState();
}

class _TopicsFeaturePageState extends State<TopicsFeaturePage> {
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
                  title: 'Topics and monitoring intents',
                  description:
                      'Create monitoring intents, tune keywords and review topic coverage before connecting sources.',
                  trailing: AppCommandBar(
                    actions: [
                      AppCommandAction(
                        label: 'Create topic',
                        icon: Icons.add,
                        onPressed: widget.store.createTopicIntent.isEnabled
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
                    placeholder: 'Search topics',
                    onSearchChanged: (value) {
                      unawaited(widget.store.updateSearch(value));
                    },
                    filters: [
                      AppFilterChipData(
                        label: 'Active',
                        selected:
                            widget.store.status == TopicLifecycleStatus.active,
                        onSelected: (selected) {
                          unawaited(
                            widget.store.updateStatus(
                              selected ? TopicLifecycleStatus.active : null,
                            ),
                          );
                        },
                      ),
                      AppFilterChipData(
                        label: 'Draft',
                        selected:
                            widget.store.status == TopicLifecycleStatus.draft,
                        onSelected: (selected) {
                          unawaited(
                            widget.store.updateStatus(
                              selected ? TopicLifecycleStatus.draft : null,
                            ),
                          );
                        },
                      ),
                    ],
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
                      return TopicEditorPanel(
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
                  child: _TopicsBody(
                    store: widget.store,
                    formStore: widget.formStore,
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

class _TopicsBody extends StatelessWidget {
  const _TopicsBody({required this.store, required this.formStore});

  final TopicsListStore store;
  final TopicsFormStore formStore;

  @override
  Widget build(BuildContext context) {
    final state = store.state;
    final items = switch (state) {
      ReadyViewState<PageResult<TopicSummary>>(:final value) => value.items,
      LoadingViewState<PageResult<TopicSummary>>(:final previousValue) =>
        previousValue?.items ?? const <TopicSummary>[],
      _ => const <TopicSummary>[],
    };
    final selected = store.selectedTopic ?? items.firstOrNull;

    return switch (state) {
      FailureViewState<PageResult<TopicSummary>>(:final failure) =>
        AppInlineProblem(
          title: 'Topics unavailable',
          message: failure.message,
          tone: AppProblemTone.warning,
          actionLabel: 'Retry',
          onAction: () => unawaited(store.load()),
        ),
      PermissionRequiredViewState<PageResult<TopicSummary>>(
        :final permissionKey,
        :final message,
      ) =>
        AppPermissionRepairSurface(
          title: 'Topic permission required',
          message: message,
          reasonCode: permissionKey,
          actionLabel: 'Refresh topics',
          onAction: () => unawaited(store.load()),
        ),
      EmptyViewState<PageResult<TopicSummary>>() => const AppInlineProblem(
        title: 'No topics',
        message: 'Create a monitoring intent to start collecting mentions.',
        tone: AppProblemTone.neutral,
      ),
      _ => AppResponsiveSplitView(
        list: AppDataList<TopicSummary>(
          items: items,
          stableId: (topic) => topic.id.value,
          isLoading: state is LoadingViewState<PageResult<TopicSummary>>,
          emptyTitle: 'No topics',
          emptyMessage:
              'Create a monitoring intent to start collecting mentions.',
          itemBuilder: (context, topic, index) {
            return ListTile(
              selected: selected?.id == topic.id,
              title: Text(topic.name.value),
              subtitle: Text('${topic.weeklyMentionCount} mentions this week'),
              trailing: AppStatusBadge(label: _statusLabel(topic.status)),
              onTap: () => store.selectTopic(topic.id),
            );
          },
        ),
        detailTitle: selected?.name.value ?? 'Topic detail',
        detail: selected == null
            ? const AppInlineProblem(
                title: 'Select a topic',
                message: 'Choose a monitoring intent to review its coverage.',
                tone: AppProblemTone.neutral,
              )
            : AppEntityHeader(
                title: selected.name.value,
                subtitle:
                    'Tracks keywords, markets and languages for the MVP monitoring loop.',
                status: AppStatusBadge(
                  label: _statusLabel(selected.status),
                  tone: selected.status == TopicLifecycleStatus.active
                      ? AppStatusTone.success
                      : AppStatusTone.neutral,
                ),
                metadata: [
                  AppEntityMetadata(
                    label: 'Mentions',
                    value: '${selected.weeklyMentionCount}',
                  ),
                  const AppEntityMetadata(label: 'Languages', value: 'EN, ES'),
                ],
                actions: AppCommandBar(
                  actions: [
                    AppCommandAction(
                      label: 'Edit',
                      icon: Icons.edit_outlined,
                      onPressed: () => formStore.beginEdit(selected),
                    ),
                    AppCommandAction(
                      label: 'Archive',
                      icon: Icons.archive_outlined,
                      variant: AppButtonVariant.secondary,
                      onPressed: store.archiveIntentFor(selected).isEnabled
                          ? () async {
                              final result = await formStore.archive(selected);
                              if (result is ResultSuccess<TopicSummary>) {
                                await store.load();
                              }
                            }
                          : null,
                    ),
                  ],
                ),
              ),
      ),
    };
  }
}

String _statusLabel(TopicLifecycleStatus status) {
  return switch (status) {
    TopicLifecycleStatus.active => 'Active',
    TopicLifecycleStatus.draft => 'Draft',
    TopicLifecycleStatus.archived => 'Archived',
    TopicLifecycleStatus.unknown => 'Unknown',
  };
}
