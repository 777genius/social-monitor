import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/aggregates/weekly_summary_projection.dart';
import '../queries/load_weekly_summary_projection_query.dart';

abstract interface class WeeklySummaryProjectionCatalog {
  Future<Result<WeeklySummaryProjection>> loadWeeklyProjection(
    LoadWeeklySummaryProjectionQuery query,
  );
}
