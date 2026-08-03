import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_weekly_summary_projection_use_case.dart';
import '../../domain/value_objects/weekly_summary_week.dart';
import '../../infrastructure/api_clients/generated_weekly_summary_projection_reader.dart';
import '../../infrastructure/repositories/generated_weekly_summary_projection_catalog.dart';
import '../stores/weekly_summaries_store.dart';

final class WeeklySummariesFeatureModule extends Module {
  WeeklySummariesFeatureModule({
    required this.generatedApiRuntime,
    required this.scope,
    DateTime? now,
  }) : _initialWeek = WeeklySummaryWeek.containing(
         now ?? DateTime.now().toUtc(),
       );

  final Object generatedApiRuntime;
  final WorkspaceScope scope;
  final WeeklySummaryWeek _initialWeek;

  Object get retentionKey =>
      'weekly-summaries-${scope.tenantId}-${scope.workspaceId}';

  @override
  void binds(Binder i) {}

  WeeklySummariesStore createStore() {
    final catalog = GeneratedWeeklySummaryProjectionCatalog(
      reader: GeneratedWeeklySummaryProjectionReader.fromRuntime(
        runtime: generatedApiRuntime,
      ),
    );
    return WeeklySummariesStore(
      scope: scope,
      initialWeek: _initialWeek,
      loadProjection: LoadWeeklySummaryProjectionUseCase(catalog),
    );
  }
}
