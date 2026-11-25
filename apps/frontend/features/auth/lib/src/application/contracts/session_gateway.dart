import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/auth_session.dart';

abstract interface class SessionGateway {
  Future<Result<AuthSession>> restoreSession();

  Future<Result<AuthSession>> selectWorkspace(WorkspaceScope scope);
}
