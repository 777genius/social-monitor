import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/auth_session.dart';
import '../contracts/session_gateway.dart';

final class RestoreSessionUseCase {
  const RestoreSessionUseCase(this._gateway);

  final SessionGateway _gateway;

  Future<Result<AuthSession>> call() {
    return _gateway.restoreSession();
  }
}
