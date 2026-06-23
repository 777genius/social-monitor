import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';

final class RequestScanCommand {
  const RequestScanCommand({
    required this.scope,
    required this.sourceBindingId,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final SourceBindingId sourceBindingId;
  final String idempotencyKey;
}
