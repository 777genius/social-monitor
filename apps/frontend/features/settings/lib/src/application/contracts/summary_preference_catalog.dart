import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/entities/summary_preference.dart';
import '../commands/save_summary_preference_command.dart';
import '../queries/load_summary_preference_query.dart';

abstract interface class SummaryPreferenceCatalog {
  Future<Result<SummaryPreference>> loadSummaryPreference(
    LoadSummaryPreferenceQuery query,
  );

  Future<Result<SummaryPreference>> saveSummaryPreference(
    SaveSummaryPreferenceCommand command,
  );
}
