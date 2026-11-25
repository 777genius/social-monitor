import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/digest_frequency.dart';

final class UpdateDigestPreferenceCommand {
  const UpdateDigestPreferenceCommand({
    required this.scope,
    required this.frequency,
  });

  final WorkspaceScope scope;
  final DigestFrequency frequency;
}
