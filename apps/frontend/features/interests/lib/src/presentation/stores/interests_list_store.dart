import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_interests_query.dart';
import '../../application/use_cases/list_interests_use_case.dart';
import '../../domain/entities/interest_summary.dart';
import '../../domain/value_objects/interest_id.dart';
import '../../domain/value_objects/interest_lifecycle_status.dart';

final class InterestsListStore extends ChangeNotifier {
  InterestsListStore({
    required ListInterestsUseCase listInterests,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _listInterests = listInterests,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final ListInterestsUseCase _listInterests;
  final OperationGenerationGuard _generationGuard;

  WorkspaceScope _scope;

  AsyncViewState<PageResult<InterestSummary>> state =
      const InitialViewState<PageResult<InterestSummary>>();
  String _search = '';
  InterestLifecycleStatus? _status;
  InterestId? _selectedInterestId;

  WorkspaceScope get scope => _scope;

  String get search => _search;

  InterestLifecycleStatus? get status => _status;

  InterestSummary? get selectedInterest {
    final currentState = state;
    if (currentState is! ReadyViewState<PageResult<InterestSummary>>) {
      return null;
    }
    for (final interest in currentState.value.items) {
      if (interest.id == _selectedInterestId) {
        return interest;
      }
    }
    return currentState.value.items.firstOrNull;
  }

  UserActionIntent get createInterestIntent {
    return const UserActionIntent(
      id: 'interests.create',
      idempotencyKey: 'interests:create',
    );
  }

  UserActionIntent archiveIntentFor(InterestSummary interest) {
    return UserActionIntent(
      id: 'interests.archive',
      risk: UserActionRisk.destructive,
      requiresConfirmation: true,
      idempotencyKey: '${_scope.workspaceId}:${interest.id.value}:archive',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    state = const InitialViewState<PageResult<InterestSummary>>();
    notifyListeners();
  }

  void selectInterest(InterestId interestId) {
    _selectedInterestId = interestId;
    notifyListeners();
  }

  Future<void> updateSearch(String value) async {
    _search = value;
    await load();
  }

  Future<void> updateStatus(InterestLifecycleStatus? value) async {
    _status = value;
    await load();
  }

  Future<void> load({
    String? search,
    InterestLifecycleStatus? status,
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
      ReadyViewState<PageResult<InterestSummary>>(:final value) => value,
      _ => null,
    };
    state = LoadingViewState<PageResult<InterestSummary>>(
      previousValue: previousValue,
    );
    notifyListeners();

    final result = await _listInterests(
      ListInterestsQuery(
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
          return const EmptyViewState<PageResult<InterestSummary>>(
            reason: 'interests.empty',
          );
        }
        return ReadyViewState<PageResult<InterestSummary>>(
          pageResult,
          isPartial: pageResult.isPartial,
        );
      },
      onFailure: (failure) {
        return FailureViewState<PageResult<InterestSummary>>(failure: failure);
      },
    );
    notifyListeners();
  }
}
