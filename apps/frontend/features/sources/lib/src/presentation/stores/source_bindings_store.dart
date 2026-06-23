import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/bind_source_to_topic_command.dart';
import '../../application/commands/change_source_binding_status_command.dart';
import '../../application/queries/list_source_bindings_query.dart';
import '../../application/queries/load_source_binding_health_query.dart';
import '../../application/use_cases/bind_source_to_topic_use_case.dart';
import '../../application/use_cases/change_source_binding_status_use_case.dart';
import '../../application/use_cases/list_source_bindings_use_case.dart';
import '../../application/use_cases/load_source_binding_health_use_case.dart';
import '../../domain/entities/source_binding.dart';
import '../../domain/entities/source_binding_health_snapshot.dart';
import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_binding_status.dart';
import '../../domain/value_objects/source_provider_key.dart';
import '../../domain/value_objects/source_topic_id.dart';
import '../view_models/source_binding_form_draft.dart';

final class SourceBindingsStore extends ChangeNotifier {
  SourceBindingsStore({
    required ListSourceBindingsUseCase listSourceBindings,
    required BindSourceToTopicUseCase bindSourceToTopic,
    required ChangeSourceBindingStatusUseCase changeSourceBindingStatus,
    required LoadSourceBindingHealthUseCase loadSourceBindingHealth,
    required WorkspaceScope scope,
    required SourceTopicId topicId,
    required this.topicTitle,
    OperationGenerationGuard? listGuard,
    OperationGenerationGuard? healthGuard,
  }) : _listSourceBindings = listSourceBindings,
       _bindSourceToTopic = bindSourceToTopic,
       _changeSourceBindingStatus = changeSourceBindingStatus,
       _loadSourceBindingHealth = loadSourceBindingHealth,
       _scope = scope,
       _topicId = topicId,
       _listGuard = listGuard ?? OperationGenerationGuard(),
       _healthGuard = healthGuard ?? OperationGenerationGuard();

  final ListSourceBindingsUseCase _listSourceBindings;
  final BindSourceToTopicUseCase _bindSourceToTopic;
  final ChangeSourceBindingStatusUseCase _changeSourceBindingStatus;
  final LoadSourceBindingHealthUseCase _loadSourceBindingHealth;
  final OperationGenerationGuard _listGuard;
  final OperationGenerationGuard _healthGuard;

  WorkspaceScope _scope;
  SourceTopicId _topicId;
  int _mutationCounter = 0;

  final String topicTitle;

  AsyncViewState<PageResult<SourceBinding>> bindingsState =
      const InitialViewState<PageResult<SourceBinding>>();
  AsyncViewState<SourceBindingHealthSnapshot> healthState =
      const InitialViewState<SourceBindingHealthSnapshot>();
  AsyncViewState<SourceBinding> mutationState =
      const InitialViewState<SourceBinding>();

  SourceBindingId? _selectedBindingId;
  bool _isBindFormOpen = false;
  final SourceBindingFormDraft _draft = SourceBindingFormDraft();

  WorkspaceScope get scope => _scope;

  SourceTopicId get topicId => _topicId;

  bool get isBindFormOpen => _isBindFormOpen;

  String get providerKey => _draft.providerKey;

  String get mode => _draft.mode;

  String get query => _draft.query;

  String get subreddit => _draft.subreddit;

  String get listing => _draft.listing;

  String get feedUrl => _draft.feedUrl;

  SourceBinding? get selectedBinding {
    final current = bindingsState;
    if (current is! ReadyViewState<PageResult<SourceBinding>>) {
      return null;
    }
    for (final binding in current.value.items) {
      if (binding.id == _selectedBindingId) {
        return binding;
      }
    }
    return current.value.items.firstOrNull;
  }

  UserActionIntent get bindSourceIntent {
    final failure = _draft.validate();
    return UserActionIntent(
      id: 'source_bindings.bind',
      idempotencyKey: '${_scope.workspaceId}:${_topicId.value}:bind',
      disabledReasonCode: failure?.code,
    );
  }

  UserActionIntent pauseIntentFor(SourceBinding binding) {
    return UserActionIntent(
      id: 'source_bindings.pause',
      idempotencyKey: '${_scope.workspaceId}:${binding.id.value}:pause',
      disabledReasonCode: binding.status.canPause
          ? null
          : 'binding_not_enabled',
    );
  }

  UserActionIntent resumeIntentFor(SourceBinding binding) {
    return UserActionIntent(
      id: 'source_bindings.resume',
      idempotencyKey: '${_scope.workspaceId}:${binding.id.value}:resume',
      disabledReasonCode: binding.status.canResume
          ? null
          : 'binding_not_paused',
    );
  }

  void updateScope({
    required WorkspaceScope scope,
    required SourceTopicId topicId,
  }) {
    if (scope == _scope && topicId == _topicId) {
      return;
    }
    _scope = scope;
    _topicId = topicId;
    _listGuard.invalidate();
    _healthGuard.invalidate();
    _selectedBindingId = null;
    bindingsState = const InitialViewState<PageResult<SourceBinding>>();
    healthState = const InitialViewState<SourceBindingHealthSnapshot>();
    mutationState = const InitialViewState<SourceBinding>();
    notifyListeners();
  }

  void openBindForm() {
    _isBindFormOpen = true;
    notifyListeners();
  }

  void closeBindForm() {
    _isBindFormOpen = false;
    mutationState = const InitialViewState<SourceBinding>();
    notifyListeners();
  }

  void updateProvider(String value) {
    _draft.updateProvider(value);
    notifyListeners();
  }

  void updateMode(String value) {
    _draft.updateMode(value);
    notifyListeners();
  }

  void updateQuery(String value) {
    _draft.query = value;
    notifyListeners();
  }

  void updateSubreddit(String value) {
    _draft.subreddit = value;
    notifyListeners();
  }

  void updateListing(String value) {
    _draft.listing = value;
    notifyListeners();
  }

  void updateFeedUrl(String value) {
    _draft.feedUrl = value;
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _listGuard.markOperationStarted();
    final previous = switch (bindingsState) {
      ReadyViewState<PageResult<SourceBinding>>(:final value) => value,
      _ => null,
    };
    bindingsState = LoadingViewState<PageResult<SourceBinding>>(
      previousValue: previous,
    );
    notifyListeners();

    final result = await _listSourceBindings(
      ListSourceBindingsQuery(scope: _scope, topicId: _topicId),
    );
    if (!_listGuard.isCurrent(generation)) {
      return;
    }
    bindingsState = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          return const EmptyViewState<PageResult<SourceBinding>>(
            reason: 'source_bindings.empty',
          );
        }
        _selectedBindingId ??= page.items.first.id;
        return ReadyViewState<PageResult<SourceBinding>>(
          page,
          isPartial: page.isPartial,
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<SourceBinding>>(failure: failure),
    );
    notifyListeners();

    final selected = selectedBinding;
    if (selected != null) {
      await loadHealth(selected);
    }
  }

  Future<void> selectBinding(SourceBinding binding) async {
    _selectedBindingId = binding.id;
    notifyListeners();
    await loadHealth(binding);
  }

  Future<void> loadHealth(SourceBinding binding) async {
    final generation = _healthGuard.markOperationStarted();
    healthState = const LoadingViewState<SourceBindingHealthSnapshot>();
    notifyListeners();

    final result = await _loadSourceBindingHealth(
      LoadSourceBindingHealthQuery(
        scope: _scope,
        topicId: _topicId,
        sourceBindingId: binding.id,
      ),
    );
    if (!_healthGuard.isCurrent(generation)) {
      return;
    }
    healthState = result.fold(
      onSuccess: ReadyViewState<SourceBindingHealthSnapshot>.new,
      onFailure: (failure) =>
          FailureViewState<SourceBindingHealthSnapshot>(failure: failure),
    );
    notifyListeners();
  }

  Future<void> bindSource() async {
    final validation = _draft.validate();
    if (validation != null) {
      mutationState = FailureViewState<SourceBinding>(failure: validation);
      notifyListeners();
      return;
    }
    _mutationCounter += 1;
    mutationState = const LoadingViewState<SourceBinding>();
    notifyListeners();

    final result = await _bindSourceToTopic(
      BindSourceToTopicCommand(
        scope: _scope,
        topicId: _topicId,
        providerKey: SourceProviderKey(_draft.providerKey),
        config: _draft.config(),
        idempotencyKey:
            '${_scope.workspaceId}:${_topicId.value}:bind:$_mutationCounter',
      ),
    );
    mutationState = result.fold(
      onSuccess: (binding) {
        _selectedBindingId = binding.id;
        _isBindFormOpen = false;
        return ReadyViewState<SourceBinding>(binding);
      },
      onFailure: (failure) => FailureViewState<SourceBinding>(failure: failure),
    );
    notifyListeners();

    if (mutationState is ReadyViewState<SourceBinding>) {
      await load();
    }
  }

  Future<void> pause(SourceBinding binding) {
    return _changeStatus(binding, SourceBindingStatus.paused);
  }

  Future<void> resume(SourceBinding binding) {
    return _changeStatus(binding, SourceBindingStatus.enabled);
  }

  Future<void> _changeStatus(
    SourceBinding binding,
    SourceBindingStatus status,
  ) async {
    _mutationCounter += 1;
    mutationState = const LoadingViewState<SourceBinding>();
    notifyListeners();
    final result = await _changeSourceBindingStatus(
      ChangeSourceBindingStatusCommand(
        scope: _scope,
        topicId: _topicId,
        sourceBindingId: binding.id,
        status: status,
        idempotencyKey:
            '${_scope.workspaceId}:${binding.id.value}:status:$_mutationCounter',
      ),
    );
    mutationState = result.fold(
      onSuccess: ReadyViewState<SourceBinding>.new,
      onFailure: (failure) => FailureViewState<SourceBinding>(failure: failure),
    );
    notifyListeners();
    if (mutationState is ReadyViewState<SourceBinding>) {
      await load();
    }
  }
}
