import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/interest_name.dart';
import '../../domain/value_objects/interest_query.dart';

final class CreateInterestCommand {
  const CreateInterestCommand({
    required this.scope,
    required this.name,
    required this.query,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final InterestName name;
  final InterestQuery query;
  final String idempotencyKey;
}
