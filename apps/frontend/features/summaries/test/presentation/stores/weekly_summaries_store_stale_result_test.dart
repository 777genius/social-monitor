import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/weekly_summary_projection_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/load_weekly_summary_projection_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_weekly_summary_projection_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/weekly_summary_projection.dart';
import 'package:social_monitor_summaries/src/presentation/stores/weekly_summaries_store.dart';

import '../../support/weekly_summary_projection_test_data.dart';

void main() {
  test('discards a result that belongs to a superseded week', () async {
    final catalog = _DeferredWeeklyProjectionCatalog();
    final store = _store(catalog);
    addTearDown(store.dispose);

    final currentLoad = store.load();
    await _waitUntil(() => catalog.pending.length == 1);
    final previousLoad = store.showPreviousWeek();
    await _waitUntil(() => catalog.pending.length == 2);

    final previousWeek = weeklySummaryTestWeek.previous();
    catalog.pending[1].complete(
      Result.success(completeWeeklySummaryProjection(week: previousWeek)),
    );
    await previousLoad;
    catalog.pending[0].complete(Result.success(completeWeeklySummaryProjection()));
    await currentLoad;

    final state = store.state as ReadyViewState<WeeklySummaryProjection>;
    expect(store.week, previousWeek);
    expect(state.value.week, previousWeek);
  });

  test('discards a result after the workspace scope changes', () async {
    final catalog = _DeferredWeeklyProjectionCatalog();
    final store = _store(catalog);
    addTearDown(store.dispose);

    final load = store.load();
    await _waitUntil(() => catalog.pending.length == 1);
    const replacementScope = WorkspaceScope(
      tenantId: 'tenant-next',
      workspaceId: 'workspace-next',
    );
    store.replaceWorkspaceScope(replacementScope);
    catalog.pending.single.complete(
      Result.success(completeWeeklySummaryProjection()),
    );
    await load;

    expect(store.scope, replacementScope);
    expect(store.state, isA<InitialViewState<WeeklySummaryProjection>>());
  });

  test('never enters ready state for a returned scope or week mismatch', () async {
    final catalog = _DeferredWeeklyProjectionCatalog();
    final store = _store(catalog);
    addTearDown(store.dispose);

    final load = store.load();
    await _waitUntil(() => catalog.pending.length == 1);
    catalog.pending.single.complete(
      Result.success(
        completeWeeklySummaryProjection(
          scope: const WorkspaceScope(
            tenantId: 'tenant-returned',
            workspaceId: 'workspace-returned',
          ),
          week: weeklySummaryTestWeek.previous(),
        ),
      ),
    );
    await load;

    final state = store.state as FailureViewState<WeeklySummaryProjection>;
    expect(
      state.failure.code,
      'summaries.weekly_returned_scope_or_week_mismatch',
    );
  });
}

WeeklySummariesStore _store(_DeferredWeeklyProjectionCatalog catalog) {
  return WeeklySummariesStore(
    scope: weeklySummaryWorkspaceScope,
    initialWeek: weeklySummaryTestWeek,
    loadProjection: LoadWeeklySummaryProjectionUseCase(catalog),
  );
}

final class _DeferredWeeklyProjectionCatalog
    implements WeeklySummaryProjectionCatalog {
  final List<_PendingWeeklyProjection> pending = [];

  @override
  Future<Result<WeeklySummaryProjection>> loadWeeklyProjection(
    LoadWeeklySummaryProjectionQuery query,
  ) {
    final completer = Completer<Result<WeeklySummaryProjection>>();
    pending.add(_PendingWeeklyProjection(query: query, completer: completer));
    return completer.future;
  }
}

final class _PendingWeeklyProjection {
  const _PendingWeeklyProjection({required this.query, required this.completer});

  final LoadWeeklySummaryProjectionQuery query;
  final Completer<Result<WeeklySummaryProjection>> completer;

  void complete(Result<WeeklySummaryProjection> result) => completer.complete(result);
}

Future<void> _waitUntil(bool Function() predicate) async {
  for (var attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await Future<void>.delayed(Duration.zero);
  }
  expect(predicate(), isTrue, reason: 'Expected weekly request to start');
}
