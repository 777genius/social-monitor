import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_interest_id.dart';
import '../../domain/value_objects/source_provider_key.dart';

final class BindSourceToInterestCommand {
  const BindSourceToInterestCommand({
    required this.scope,
    required this.interestId,
    required this.providerKey,
    required this.config,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final SourceInterestId interestId;
  final SourceProviderKey providerKey;
  final Map<String, Object?> config;
  final String idempotencyKey;
}
