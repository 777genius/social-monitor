import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_binding_id.dart';
import '../../domain/value_objects/source_interest_id.dart';

final class LoadSourceBindingHealthQuery {
  const LoadSourceBindingHealthQuery({
    required this.scope,
    required this.interestId,
    required this.sourceBindingId,
  });

  final WorkspaceScope scope;
  final SourceInterestId interestId;
  final SourceBindingId sourceBindingId;
}
