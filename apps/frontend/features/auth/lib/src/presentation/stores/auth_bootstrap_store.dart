import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/restore_session_use_case.dart';
import '../../application/use_cases/select_workspace_use_case.dart';
import '../../domain/entities/auth_session.dart';

final class AuthBootstrapStore extends ChangeNotifier {
  AuthBootstrapStore({
    required RestoreSessionUseCase restoreSession,
    required SelectWorkspaceUseCase selectWorkspace,
    OperationGenerationGuard? generationGuard,
  }) : _restoreSession = restoreSession,
       _selectWorkspace = selectWorkspace,
       _generationGuard = generationGuard ?? OperationGenerationGuard();

  final RestoreSessionUseCase _restoreSession;
  final SelectWorkspaceUseCase _selectWorkspace;
  final OperationGenerationGuard _generationGuard;

  AsyncViewState<AuthSession> state = const InitialViewState<AuthSession>();
  AuthSession? _session;
  UserActionIntent? _pendingIntent;

  AuthSession? get session => _session;

  UserActionIntent? get pendingIntent => _pendingIntent;

  Future<void> restoreSession() async {
    final generation = _generationGuard.markOperationStarted();
    state = LoadingViewState<AuthSession>(previousValue: _session);
    notifyListeners();

    final result = await _restoreSession();
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    _applyResult(result);
  }

  Future<void> selectWorkspace(WorkspaceScope scope) async {
    final generation = _generationGuard.markOperationStarted();
    state = LoadingViewState<AuthSession>(previousValue: _session);
    notifyListeners();

    final result = await _selectWorkspace(scope);
    if (!_generationGuard.isCurrent(generation)) {
      return;
    }

    _applyResult(result);
  }

  void rememberPendingIntent(UserActionIntent intent) {
    _pendingIntent = intent;
    notifyListeners();
  }

  UserActionIntent? takeSafePendingIntent() {
    final intent = _pendingIntent;
    if (intent == null ||
        intent.isRisky ||
        intent.requiresConfirmation ||
        !intent.isEnabled) {
      return null;
    }
    _pendingIntent = null;
    notifyListeners();
    return intent;
  }

  void _applyResult(Result<AuthSession> result) {
    state = result.fold(
      onSuccess: (session) {
        _session = session;
        if (!session.hasWorkspace) {
          return const PermissionRequiredViewState<AuthSession>(
            permissionKey: 'workspace.select',
            message: 'Select a workspace before opening monitoring data.',
          );
        }
        return ReadyViewState<AuthSession>(session);
      },
      onFailure: (failure) => FailureViewState<AuthSession>(failure: failure),
    );
    notifyListeners();
  }
}
