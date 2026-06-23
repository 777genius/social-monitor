import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_topics_query.dart';
import '../../application/use_cases/list_topics_use_case.dart';
import '../../domain/entities/topic_summary.dart';
import '../../domain/value_objects/topic_id.dart';
import '../../domain/value_objects/topic_lifecycle_status.dart';

final class TopicsListStore extends ChangeNotifier {
  TopicsListStore({
    required ListTopicsUseCase listTopics,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _listTopics = listTopics,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final ListTopicsUseCase _listTopics;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;

  AsyncViewState<PageResult<TopicSummary>> state =
      const InitialViewState<PageResult<TopicSummary>>();
  String _search = '';
  TopicLifecycleStatus? _status;
  TopicId? _selectedTopicId;

  WorkspaceScope get scope => _scope;

  String get search => _search;

  TopicLifecycleStatus? get status => _status;

  TopicSummary? get selectedTopic {
    final currentState = state;
    if (currentState is! ReadyViewState<PageResult<TopicSummary>>) {
      return null;
    }
    for (final topic in currentState.value.items) {
      if (topic.id == _selectedTopicId) {
        return topic;
      }
    }
    return currentState.value.items.firstOrNull;
  }

  UserActionIntent get createTopicIntent {
    return const UserActionIntent(
      id: 'topics.create',
      idempotencyKey: 'topics:create',
    );
  }

  UserActionIntent archiveIntentFor(TopicSummary topic) {
    return UserActionIntent(
      id: 'topics.archive',
      risk: UserActionRisk.destructive,
      requiresConfirmation: true,
      idempotencyKey: '${_scope.workspaceId}:${topic.id.value}:archive',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    state = const InitialViewState<PageResult<TopicSummary>>();
    notifyListeners();
  }

  void selectTopic(TopicId topicId) {
    _selectedTopicId = topicId;
    notifyListeners();
  }

  Future<void> updateSearch(String value) async {
    _search = value;
    await load();
  }

  Future<void> updateStatus(TopicLifecycleStatus? value) async {
    _status = value;
    await load();
  }

  Future<void> load({
    String? search,
    TopicLifecycleStatus? status,
    PageRequest page = const PageRequest(),
  }) async {
    if (search != null) {
      _search = search;
    }
    if (status != null || _status != null) {
      _status = status;
    }
    final generation = _generationGuard.markOperationStarted();
    final previousValue = switch (state) {
      ReadyViewState<PageResult<TopicSummary>>(:final value) => value,
      _ => null,
    };
    state = LoadingViewState<PageResult<TopicSummary>>(
      previousValue: previousValue,
    );
    notifyListeners();

    final result = await _listTopics(
      ListTopicsQuery(
        scope: _scope,
        page: page,
        search: _search,
        status: _status,
      ),
    );

    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    state = result.fold(
      onSuccess: (pageResult) {
        if (pageResult.items.isEmpty) {
          return const EmptyViewState<PageResult<TopicSummary>>(
            reason: 'topics.empty',
          );
        }
        return ReadyViewState<PageResult<TopicSummary>>(
          pageResult,
          isPartial: pageResult.isPartial,
        );
      },
      onFailure: (failure) {
        return FailureViewState<PageResult<TopicSummary>>(failure: failure);
      },
    );
    notifyListeners();
  }
}
