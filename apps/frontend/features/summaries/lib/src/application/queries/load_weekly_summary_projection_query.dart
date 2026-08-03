import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/weekly_summary_week.dart';

final class LoadWeeklySummaryProjectionQuery {
  const LoadWeeklySummaryProjectionQuery({
    required this.scope,
    required this.week,
  });

  final WorkspaceScope scope;
  final WeeklySummaryWeek week;
}
