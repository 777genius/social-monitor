import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/summary_id.dart';

final class LoadSummaryDetailQuery {
  const LoadSummaryDetailQuery({required this.scope, required this.summaryId});

  final WorkspaceScope scope;
  final SummaryId summaryId;
}
