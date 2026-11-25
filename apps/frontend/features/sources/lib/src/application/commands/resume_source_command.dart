import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/source_id.dart';

final class ResumeSourceCommand {
  const ResumeSourceCommand({required this.scope, required this.sourceId});

  final WorkspaceScope scope;
  final SourceId sourceId;
}
