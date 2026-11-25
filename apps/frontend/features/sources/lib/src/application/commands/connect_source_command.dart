import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class ConnectSourceCommand {
  const ConnectSourceCommand({
    required this.scope,
    required this.providerKey,
    required this.displayName,
  });

  final WorkspaceScope scope;
  final String providerKey;
  final String displayName;
}
