import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_provider_key.dart';
import '../../domain/value_objects/source_topic_id.dart';

final class BindSourceToTopicCommand {
  const BindSourceToTopicCommand({
    required this.scope,
    required this.topicId,
    required this.providerKey,
    required this.config,
    required this.idempotencyKey,
  });

  final WorkspaceScope scope;
  final SourceTopicId topicId;
  final SourceProviderKey providerKey;
  final Map<String, Object?> config;
  final String idempotencyKey;
}
