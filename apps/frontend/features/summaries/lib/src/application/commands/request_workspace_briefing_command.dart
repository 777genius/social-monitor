import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class RequestWorkspaceBriefingCommand {
  const RequestWorkspaceBriefingCommand({
    required this.scope,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final String idempotencyKey;
}
