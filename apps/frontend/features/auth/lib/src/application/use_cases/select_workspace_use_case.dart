import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/auth_session.dart';
import '../contracts/session_gateway.dart';

final class SelectWorkspaceUseCase {
  const SelectWorkspaceUseCase(this._gateway);

  final SessionGateway _gateway;

  Future<Result<AuthSession>> call(WorkspaceScope scope) {
    if (!scope.isValid) {
      return Future.value(
        const Result.failure(
          ValidationFailure(
            message: 'Workspace scope is required',
            code: 'auth.workspace_scope_required',
          ),
        ),
      );
    }
    return _gateway.selectWorkspace(scope);
  }
}
