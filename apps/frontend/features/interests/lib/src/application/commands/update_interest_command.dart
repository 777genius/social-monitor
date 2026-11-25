import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/interest_id.dart';
import '../../domain/value_objects/interest_name.dart';
import '../../domain/value_objects/interest_query.dart';

final class UpdateInterestCommand {
  const UpdateInterestCommand({
    required this.scope,
    required this.interestId,
    required this.name,
    required this.query,
  });

  final WorkspaceScope scope;
  final InterestId interestId;
  final InterestName name;
  final InterestQuery query;
}
