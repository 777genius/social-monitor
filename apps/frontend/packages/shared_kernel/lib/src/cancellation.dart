import 'app_failure.dart';
import 'workspace_scope.dart';

final class WorkspaceRequestGuard {
  WorkspaceRequestGuard(this._scope);

  WorkspaceScope _scope;
  int _generation = 0;

  WorkspaceScope get scope => _scope;

  int get generation => _generation;

  int markRequestStarted() => _generation;

  void replaceScope(WorkspaceScope nextScope) {
    if (_scope == nextScope) {
      return;
    }
    _scope = nextScope;
    _generation += 1;
  }

  AppFailure? staleFailureFor(int requestGeneration) {
    if (requestGeneration == _generation) {
      return null;
    }
    return const StaleWorkspaceFailure(
      message: 'Request completed after workspace changed',
      code: 'stale_workspace',
    );
  }
}
