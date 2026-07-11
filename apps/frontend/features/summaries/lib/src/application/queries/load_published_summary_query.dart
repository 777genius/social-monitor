import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

final class LoadPublishedSummaryQuery {
  const LoadPublishedSummaryQuery({
    required this.scope,
    required this.summaryId,
  });

  final WorkspaceScope scope;
  final String summaryId;
}
