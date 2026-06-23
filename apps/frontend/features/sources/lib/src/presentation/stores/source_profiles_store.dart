import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/list_source_profiles_query.dart';
import '../../application/use_cases/list_source_profiles_use_case.dart';
import '../../domain/entities/source_profile.dart';
import '../../domain/value_objects/source_provider_key.dart';

final class SourceProfilesStore extends ChangeNotifier {
  SourceProfilesStore({
    required ListSourceProfilesUseCase listSourceProfiles,
    required WorkspaceScope scope,
    OperationGenerationGuard? generationGuard,
  }) : _listSourceProfiles = listSourceProfiles,
       _scope = scope,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final ListSourceProfilesUseCase _listSourceProfiles;
  final OperationGenerationGuard _generationGuard;
  WorkspaceScope _scope;
  final Set<SourceProviderKey> _expandedProfiles = <SourceProviderKey>{};

  AsyncViewState<PageResult<SourceProfile>> state =
      const InitialViewState<PageResult<SourceProfile>>();

  WorkspaceScope get scope => _scope;

  bool isExpanded(SourceProviderKey providerKey) {
    return _expandedProfiles.contains(providerKey);
  }

  void toggleLimitations(SourceProviderKey providerKey) {
    if (!_expandedProfiles.add(providerKey)) {
      _expandedProfiles.remove(providerKey);
    }
    notifyListeners();
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _generationGuard.invalidate();
    _expandedProfiles.clear();
    state = const InitialViewState<PageResult<SourceProfile>>();
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _generationGuard.markOperationStarted();
    final previous = state is ReadyViewState<PageResult<SourceProfile>>
        ? (state as ReadyViewState<PageResult<SourceProfile>>).value
        : null;
    state = LoadingViewState<PageResult<SourceProfile>>(
      previousValue: previous,
    );
    notifyListeners();

    final result = await _listSourceProfiles(
      ListSourceProfilesQuery(scope: _scope),
    );
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }
    state = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          return const EmptyViewState<PageResult<SourceProfile>>(
            reason: 'source_profiles.empty',
          );
        }
        return ReadyViewState<PageResult<SourceProfile>>(page);
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<SourceProfile>>(failure: failure),
    );
    notifyListeners();
  }
}
