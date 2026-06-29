import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/interest_id.dart';

final class ArchiveInterestCommand {
  const ArchiveInterestCommand({required this.scope, required this.interestId});

  final WorkspaceScope scope;
  final InterestId interestId;
}
