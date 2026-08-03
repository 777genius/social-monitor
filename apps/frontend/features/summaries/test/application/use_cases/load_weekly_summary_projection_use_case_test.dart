import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/weekly_summary_projection_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/load_weekly_summary_projection_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_weekly_summary_projection_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';

import '../../support/weekly_summary_projection_test_data.dart';

void main() {
  test('loads a weekly projection through the narrow catalog contract', () async {
    final catalog = _WeeklyProjectionCatalog(
      Result.success(completeWeeklySummaryProjection()),
    );
    final useCase = LoadWeeklySummaryProjectionUseCase(catalog);

    final result = await useCase(
      LoadWeeklySummaryProjectionQuery(
        scope: weeklySummaryWorkspaceScope,
        week: weeklySummaryTestWeek,
      ),
    );

    expect(result, isA<ResultSuccess<WeeklySummaryProjection>>());
    expect(catalog.calls, 1);
  });

  test('rejects an invalid workspace before calling the catalog', () async {
    final catalog = _WeeklyProjectionCatalog(
      Result.success(completeWeeklySummaryProjection()),
    );
    final useCase = LoadWeeklySummaryProjectionUseCase(catalog);

    final result = await useCase(
      LoadWeeklySummaryProjectionQuery(
        scope: const WorkspaceScope(tenantId: '', workspaceId: ''),
        week: weeklySummaryTestWeek,
      ),
    );

    expect(result, isA<ResultFailure<WeeklySummaryProjection>>());
    expect(
      (result as ResultFailure<WeeklySummaryProjection>).failure.code,
      'summaries.weekly_workspace_scope_required',
    );
    expect(catalog.calls, 0);
  });

  test('rejects a catalog projection returned for another scope or week', () async {
    const returnedScope = WorkspaceScope(
      tenantId: 'tenant-returned',
      workspaceId: 'workspace-returned',
    );
    final catalog = _WeeklyProjectionCatalog(
      Result.success(
        completeWeeklySummaryProjection(
          scope: returnedScope,
          week: weeklySummaryTestWeek.previous(),
        ),
      ),
    );
    final useCase = LoadWeeklySummaryProjectionUseCase(catalog);

    final result = await useCase(
      LoadWeeklySummaryProjectionQuery(
        scope: weeklySummaryWorkspaceScope,
        week: weeklySummaryTestWeek,
      ),
    );

    expect(
      (result as ResultFailure<WeeklySummaryProjection>).failure.code,
      'summaries.weekly_returned_scope_or_week_mismatch',
    );
  });
}

final class _WeeklyProjectionCatalog implements WeeklySummaryProjectionCatalog {
  _WeeklyProjectionCatalog(this.result);

  final Result<WeeklySummaryProjection> result;
  int calls = 0;

  @override
  Future<Result<WeeklySummaryProjection>> loadWeeklyProjection(
    LoadWeeklySummaryProjectionQuery query,
  ) {
    calls += 1;
    return Future<Result<WeeklySummaryProjection>>.value(result);
  }
}
