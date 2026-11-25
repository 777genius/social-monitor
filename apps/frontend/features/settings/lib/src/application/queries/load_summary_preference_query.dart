import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class LoadSummaryPreferenceQuery {
  const LoadSummaryPreferenceQuery({required this.scope, required this.userId});

  final WorkspaceScope scope;
  final String userId;
}
