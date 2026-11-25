import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';

final class LoadScanPolicyQuery {
  const LoadScanPolicyQuery({
    required this.scope,
    required this.sourceBindingId,
  });

  final WorkspaceScope scope;
  final SourceBindingId sourceBindingId;
}
