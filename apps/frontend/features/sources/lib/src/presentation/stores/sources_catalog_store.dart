import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/connect_source_command.dart';
import '../../application/commands/pause_source_command.dart';
import '../../application/commands/reconnect_source_command.dart';
import '../../application/commands/resume_source_command.dart';
import '../../application/queries/list_sources_query.dart';
import '../../application/queries/load_source_health_query.dart';
import '../../application/use_cases/connect_source_use_case.dart';
import '../../application/use_cases/list_sources_use_case.dart';
import '../../application/use_cases/load_source_health_use_case.dart';
import '../../application/use_cases/pause_source_use_case.dart';
import '../../application/use_cases/reconnect_source_use_case.dart';
import '../../application/use_cases/resume_source_use_case.dart';
import '../../domain/entities/source_health_snapshot.dart';
import '../../domain/entities/source_summary.dart';
import '../../domain/value_objects/credential_health.dart';
import '../../domain/value_objects/source_collection_status.dart';
import '../../domain/value_objects/source_id.dart';

final class SourcesCatalogStore extends ChangeNotifier {
  SourcesCatalogStore({
    required ListSourcesUseCase listSources,
    required ConnectSourceUseCase connectSource,
    required ReconnectSourceUseCase reconnectSource,
    required PauseSourceUseCase pauseSource,
    required ResumeSourceUseCase resumeSource,
    required LoadSourceHealthUseCase loadSourceHealth,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _listSources = listSources,
       _connectSource = connectSource,
       _reconnectSource = reconnectSource,
       _pauseSource = pauseSource,
       _resumeSource = resumeSource,
       _loadSourceHealth = loadSourceHealth,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final ListSourcesUseCase _listSources;
  final ConnectSourceUseCase _connectSource;
  final ReconnectSourceUseCase _reconnectSource;
  final PauseSourceUseCase _pauseSource;
  final ResumeSourceUseCase _resumeSource;
  final LoadSourceHealthUseCase _loadSourceHealth;
  final OperationGenerationGuard _generationGuard;
  WorkspaceScope _scope;

  AsyncViewState<PageResult<SourceSummary>> state =
      const InitialViewState<PageResult<SourceSummary>>();
  AsyncViewState<SourceSummary> repairState =
      const InitialViewState<SourceSummary>();
  AsyncViewState<SourceHealthSnapshot> healthState =
      const InitialViewState<SourceHealthSnapshot>();
  SourceId? _selectedSourceId;

  WorkspaceScope get scope => _scope;

  SourceSummary? get selectedSource {
    final current = state;
    if (current is! ReadyViewState<PageResult<SourceSummary>>) {
      return null;
    }
    for (final source in current.value.items) {
      if (source.id == _selectedSourceId) {
        return source;
      }
    }
    return current.value.items.firstOrNull;
  }

  SourceSummary? get repairCandidate {
    final current = state;
    if (current is! ReadyViewState<PageResult<SourceSummary>>) {
      return null;
    }
    for (final source in current.value.items) {
      if (source.credentialHealth == CredentialHealth.expired ||
          source.credentialHealth == CredentialHealth.disconnected) {
        return source;
      }
    }
    return null;
  }

  UserActionIntent get connectIntent {
    return UserActionIntent(
      id: 'sources.connect',
      idempotencyKey: '${_scope.workspaceId}:sources:connect',
    );
  }

  UserActionIntent reconnectIntentFor(SourceSummary source) {
    return UserActionIntent(
      id: 'sources.reconnect',
      risk: UserActionRisk.credential,
      requiresConfirmation: true,
      idempotencyKey: '${_scope.workspaceId}:${source.id.value}:reconnect',
      disabledReasonCode: source.capability.isEnabled
          ? null
          : source.capability.disabledReasonCode ?? 'capability_disabled',
    );
  }

  UserActionIntent pauseIntentFor(SourceSummary source) {
    return UserActionIntent(
      id: 'sources.pause',
      disabledReasonCode:
          source.collectionStatus == SourceCollectionStatus.paused
          ? 'source_already_paused'
          : null,
      idempotencyKey: '${_scope.workspaceId}:${source.id.value}:pause',
    );
  }

  UserActionIntent resumeIntentFor(SourceSummary source) {
    return UserActionIntent(
      id: 'sources.resume',
      disabledReasonCode:
          source.collectionStatus == SourceCollectionStatus.collecting
          ? 'source_already_collecting'
          : null,
      idempotencyKey: '${_scope.workspaceId}:${source.id.value}:resume',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    state = const InitialViewState<PageResult<SourceSummary>>();
    repairState = const InitialViewState<SourceSummary>();
    healthState = const InitialViewState<SourceHealthSnapshot>();
    _selectedSourceId = null;
    notifyListeners();
  }

  void selectSource(SourceId sourceId) {
    _selectedSourceId = sourceId;
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previousValue = switch (state) {
      ReadyViewState<PageResult<SourceSummary>>(:final value) => value,
      LoadingViewState<PageResult<SourceSummary>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    state = LoadingViewState<PageResult<SourceSummary>>(
      previousValue: previousValue,
    );
    notifyListeners();

    final result = await _listSources(ListSourcesQuery(scope: _scope));
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    state = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          return const EmptyViewState<PageResult<SourceSummary>>(
            reason: 'sources.empty',
          );
        }
        _selectedSourceId ??= page.items.first.id;
        return ReadyViewState<PageResult<SourceSummary>>(page);
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<SourceSummary>>(failure: failure),
    );
    notifyListeners();
  }

  Future<void> connectDemoSource() async {
    final result = await _connectSource(
      ConnectSourceCommand(
        scope: _scope,
        providerKey: 'web',
        displayName: 'Web mentions',
      ),
    );
    result.fold(onSuccess: (_) {}, onFailure: (_) {});
    await load();
  }

  Future<void> reconnect(SourceSummary source) async {
    final generation = _generationGuard.markOperationStarted();
    repairState = const LoadingViewState<SourceSummary>();
    notifyListeners();

    final result = await _reconnectSource(
      ReconnectSourceCommand(scope: _scope, sourceId: source.id),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    repairState = result.fold(
      onSuccess: ReadyViewState<SourceSummary>.new,
      onFailure: (failure) => FailureViewState<SourceSummary>(failure: failure),
    );
    await load();
  }

  Future<void> pause(SourceSummary source) async {
    await _mutateSource(
      () =>
          _pauseSource(PauseSourceCommand(scope: _scope, sourceId: source.id)),
    );
  }

  Future<void> resume(SourceSummary source) async {
    await _mutateSource(
      () => _resumeSource(
        ResumeSourceCommand(scope: _scope, sourceId: source.id),
      ),
    );
  }

  Future<void> loadHealth(SourceSummary source) async {
    final generation = _generationGuard.markOperationStarted();
    healthState = const LoadingViewState<SourceHealthSnapshot>();
    notifyListeners();

    final result = await _loadSourceHealth(
      LoadSourceHealthQuery(scope: _scope, sourceId: source.id),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    healthState = result.fold(
      onSuccess: ReadyViewState<SourceHealthSnapshot>.new,
      onFailure: (failure) =>
          FailureViewState<SourceHealthSnapshot>(failure: failure),
    );
    notifyListeners();
  }

  Future<void> _mutateSource(
    Future<Result<SourceSummary>> Function() operation,
  ) async {
    final generation = _generationGuard.markOperationStarted();
    repairState = const LoadingViewState<SourceSummary>();
    notifyListeners();

    final result = await operation();
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    repairState = result.fold(
      onSuccess: ReadyViewState<SourceSummary>.new,
      onFailure: (failure) => FailureViewState<SourceSummary>(failure: failure),
    );
    await load();
  }
}
