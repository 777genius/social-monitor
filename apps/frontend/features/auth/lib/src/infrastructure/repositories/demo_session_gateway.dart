import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/session_gateway.dart';
import '../../domain/entities/auth_session.dart';
import '../../domain/entities/workspace_access.dart';

final class DemoSessionGateway implements SessionGateway {
  DemoSessionGateway({
    AuthSession? initialSession,
    this.latency = Duration.zero,
  }) : _session = initialSession ?? _demoSession;

  AuthSession _session;
  final Duration latency;

  @override
  Future<Result<AuthSession>> restoreSession() async {
    await _delayIfNeeded();
    return Result.success(_session);
  }

  @override
  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope) async {
    await _delayIfNeeded();
    for (final workspace in _session.workspaces) {
      if (workspace.scope == scope) {
        _session = _session.copyWith(selectedWorkspace: workspace);
        return Result.success(_session);
      }
    }
    return const Result.failure(
      NotFoundFailure(
        message: 'Workspace is not available for this session',
        code: 'auth.workspace_not_found',
      ),
    );
  }

  Future<void> _delayIfNeeded() async {
    if (latency > Duration.zero) {
      await Future<void>.delayed(latency);
    }
  }

  static const _demoScope = WorkspaceScope(
    tenantId: 'tenant-demo',
    workspaceId: 'ws-demo',
  );

  static const _demoSession = AuthSession(
    userId: 'user-demo',
    userLabel: 'MVP Operator',
    userRole: 'admin',
    selectedWorkspace: WorkspaceAccess(
      scope: _demoScope,
      tenantName: 'Acme',
      workspaceName: 'Acme alerts',
      workspaceRole: 'owner',
      statusLabel: 'Active',
    ),
    workspaces: [
      WorkspaceAccess(
        scope: _demoScope,
        tenantName: 'Acme',
        workspaceName: 'Acme alerts',
        workspaceRole: 'owner',
        statusLabel: 'Active',
      ),
      WorkspaceAccess(
        scope: WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'ws-lab'),
        tenantName: 'Acme',
        workspaceName: 'Launch lab',
        workspaceRole: 'admin',
        statusLabel: 'Ready',
      ),
    ],
  );
}
