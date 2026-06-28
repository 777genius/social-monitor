import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/session_gateway.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/workspace_access.dart';
import '../mappers/generated_auth_session_rest_mapper.dart';

final class GeneratedAuthSessionGateway implements SessionGateway {
  GeneratedAuthSessionGateway({
    required generated.GeneratedApiRuntime runtime,
    GeneratedAuthSessionRestMapper mapper =
        const GeneratedAuthSessionRestMapper(),
    void Function(AuthSession session)? onSessionRestored,
    void Function(WorkspaceAccess workspace)? onWorkspaceSelected,
  }) : _runtime = runtime,
       _mapper = mapper,
       _onSessionRestored = onSessionRestored,
       _onWorkspaceSelected = onWorkspaceSelected;

  factory GeneratedAuthSessionGateway.fromRuntime({
    required Object runtime,
    GeneratedAuthSessionRestMapper mapper =
        const GeneratedAuthSessionRestMapper(),
    void Function(AuthSession session)? onSessionRestored,
    void Function(WorkspaceAccess workspace)? onWorkspaceSelected,
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedAuthSessionGateway(
      runtime: runtime,
      mapper: mapper,
      onSessionRestored: onSessionRestored,
      onWorkspaceSelected: onWorkspaceSelected,
    );
  }

  final generated.GeneratedApiRuntime _runtime;
  final GeneratedAuthSessionRestMapper _mapper;
  final void Function(AuthSession session)? _onSessionRestored;
  final void Function(WorkspaceAccess workspace)? _onWorkspaceSelected;

  AuthSession? _session;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    final result = await _runtime.client.sendUnscoped(
      () => _runtime.rest.auth.authSessionControllerGet(),
    );

    return result.fold(
      onSuccess: (dto) {
        final session = _mapper.authSession(dto);
        _session = session;
        _onSessionRestored?.call(session);
        return Result.success(session);
      },
      onFailure: Result<AuthSession>.failure,
    );
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    final session = _session;
    if (session == null) {
      return const Result.failure(
        ValidationFailure(
          message: 'Restore the session before selecting a workspace',
          code: 'auth.session_restore_required',
        ),
      );
    }

    for (final workspace in session.workspaces) {
      if (workspace.scope == scope) {
        final updated = session.copyWith(selectedWorkspace: workspace);
        _session = updated;
        _onWorkspaceSelected?.call(workspace);
        return Result.success(updated);
      }
    }

    return const Result.failure(
      NotFoundFailure(
        message: 'Workspace is not available for this session',
        code: 'auth.workspace_not_found',
      ),
    );
  }
}
