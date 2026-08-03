import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../domain/value_objects/weekly_summary_week.dart';

final class GeneratedWeeklySummaryProjectionReader {
  const GeneratedWeeklySummaryProjectionReader({
    required generated.GeneratedApiRuntime runtime,
  }) : _runtime = runtime;

  factory GeneratedWeeklySummaryProjectionReader.fromRuntime({
    required Object runtime,
  }) {
    if (runtime is! generated.GeneratedApiRuntime) {
      throw ArgumentError.value(
        runtime,
        'runtime',
        'Expected GeneratedApiRuntime from packages/generated_api',
      );
    }
    return GeneratedWeeklySummaryProjectionReader(runtime: runtime);
  }

  final generated.GeneratedApiRuntime _runtime;

  Future<Result<generated.ReaderSummaryWeeklyProjectionResponseDto>> load({
    required WorkspaceScope scope,
    required WeeklySummaryWeek week,
  }) {
    return _runtime.client
        .send<generated.ReaderSummaryWeeklyProjectionResponseDto>(
          generated.WorkspaceRequest(scope: scope),
          () => _runtime.rest.readerSummaries
              .readerSummaryWeeklyProjectionControllerGet(
                weekStartedOn: week.startedOnIso,
                xWorkspaceId: scope.workspaceId,
                xTenantId: scope.tenantId,
              ),
        );
  }
}
