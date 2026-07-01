import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/regenerate_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/request_workspace_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_reader_action_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_summary_feedback_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/list_summaries_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_summary_detail_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_summary_job_status_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_summary_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/entities/reader_summary_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_feedback_kind.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_id.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';
import 'package:social_monitor_summaries/src/presentation/workflows/summaries_review_store_dependencies.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  test('loads summaries and disables regeneration while generating', () async {
    final store = _store([
      summaryApiDto(),
      summaryApiDto(
        id: 's-2',
        title: 'Launch sentiment pulse',
        status: 'generating',
      ),
    ]);

    await store.load();

    final state =
        store.listState as ReadyViewState<PageResult<GeneratedSummary>>;
    expect(state.value.items, hasLength(2));
    expect(
      store.regenerationIntentFor(state.value.items[1]).disabledReasonCode,
      'summaries.generation_in_progress',
    );
  });

  test('submits feedback with stable idempotency key', () async {
    final store = _store([summaryApiDto()]);

    await store.load();
    final summary = store.selectedSummary!;
    final intent = store.feedbackIntentFor(
      summary,
      SummaryFeedbackKind.helpful,
    );

    expect(intent.idempotencyKey, 'workspace-demo:s-1:helpful');

    await store.submitFeedback(summary, SummaryFeedbackKind.helpful);

    final updated = store.selectedSummary!;
    expect(updated.feedbackSubmitted, isTrue);
    expect(store.feedbackState, isA<ReadyViewState<GeneratedSummary>>());
    expect(
      store.feedbackIntentFor(updated, SummaryFeedbackKind.helpful).isEnabled,
      isFalse,
    );
  });

  test('requests workspace summary and refreshes it after polling', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceSummary: readerSummaryApiDto());

    await store.requestWorkspaceSummary();

    final jobState =
        store.summaryJobState as ReadyViewState<ReaderSummaryJobSnapshot>;
    expect(jobState.value.status, ReaderSummaryJobStatus.completed);
    final workspaceSummaryState =
        store.workspaceSummaryState as ReadyViewState<WorkspaceSummarySnapshot>;
    expect(workspaceSummaryState.value.current?.title, 'AI workspace summary');
    expect(store.isSummaryGenerationInProgress, isFalse);
  });

  test('selects summary period for workspace load and request APIs', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
    final store = _storeFromCatalog(catalog);

    await store.selectWorkspaceSummaryPeriod(SummaryPeriodPreset.weekly);
    await store.requestWorkspaceSummary();

    expect(store.selectedSummaryPeriodPreset, SummaryPeriodPreset.weekly);
    expect(
      apiClient.loadWorkspaceSummaryRequests.last.period.cadence,
      SummaryPeriodCadence.weekly,
    );
    expect(
      apiClient.requestWorkspaceSummaryRequests.last.period.cadence,
      SummaryPeriodCadence.weekly,
    );
  });

  test('exposes available workspace summary periods while reloading', () {
    final availablePeriod = SummaryPeriodPreset.daily.resolveForCalendarDate(
      DateTime(2026, 6, 15),
      now: DateTime.utc(2026, 6, 27, 12),
    );
    final store = _store([summaryApiDto()]);
    store.workspaceSummaryState = LoadingViewState<WorkspaceSummarySnapshot>(
      previousValue: WorkspaceSummarySnapshot(
        availablePeriods: [availablePeriod, availablePeriod],
      ),
    );

    final periods = store.availableWorkspaceSummaryPeriods;

    expect(periods, hasLength(1));
    expect(periods.single.startedAt, DateTime.utc(2026, 6, 15));
    expect(periods.single.endedAt, DateTime.utc(2026, 6, 16));
  });

  test('submits reader relevance action from summary top read', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceSummary: readerSummaryApiDto());

    await store.loadWorkspaceSummary();

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final markRelevant = summary.content.nextActions.firstWhere(
      (action) => action.kind == 'mark_relevant',
    );
    final watchRepository = summary.content.nextActions.firstWhere(
      (action) => action.kind == 'watch_repository',
    );
    final readSource = summary.content.nextActions.firstWhere(
      (action) => action.kind == 'read_source',
    );

    expect(store.readerActionIntentFor(summary, readSource).isEnabled, true);
    expect(store.readerActionIntentFor(summary, markRelevant).isEnabled, true);
    expect(
      store.readerActionIntentFor(summary, watchRepository).disabledReasonCode,
      'summaries.reader_action_not_supported',
    );

    await store.submitReaderAction(summary, markRelevant);

    final state = store.readerActionState as ReadyViewState<ReaderActionResult>;
    expect(state.value.kind, 'mark_relevant');
    expect(state.value.learningDirection, 'positive');
    expect(state.value.idempotencyKey, contains(':mark_relevant:'));
  });

  test('submits reader negative feedback with an explicit reason', () async {
    final apiClient = InMemorySummariesApiClient(
      items: [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
    );
    final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
    final store = _storeFromCatalog(catalog);

    await store.loadWorkspaceSummary();

    final summary =
        (store.workspaceSummaryState
                as ReadyViewState<WorkspaceSummarySnapshot>)
            .value
            .current!;
    final notRelevant = summary.content.nextActions.firstWhere(
      (action) => action.kind == 'mark_not_relevant',
    );

    await store.submitReaderAction(
      summary,
      notRelevant,
      ReaderFeedbackReason.notSameStory,
    );

    final state = store.readerActionState as ReadyViewState<ReaderActionResult>;
    expect(state.value.kind, 'mark_not_relevant');
    expect(state.value.learningDirection, 'negative');
    expect(
      apiClient.submittedReaderActionRequests.single.feedbackReason,
      ReaderFeedbackReason.notSameStory,
    );
  });

  test(
    'opens reader source action without relevance feedback target',
    () async {
      final launcher = _FakeReaderSourceLauncher();
      final store = _store(
        [summaryApiDto()],
        workspaceSummary: readerSummaryApiDto(),
        sourceLauncher: launcher,
      );

      await store.loadWorkspaceSummary();

      final summary =
          (store.workspaceSummaryState
                  as ReadyViewState<WorkspaceSummarySnapshot>)
              .value
              .current!;
      final readSource = summary.content.nextActions.firstWhere(
        (action) => action.kind == 'read_source',
      );

      await store.submitReaderAction(summary, readSource);

      expect(
        launcher.opened.single.toString(),
        'https://github.com/example/ai-coding-tools',
      );
      final state =
          store.readerActionState as ReadyViewState<ReaderActionResult>;
      expect(state.value.kind, 'read_source');
      expect(state.value.learningDirection, 'external_source_opened');
    },
  );

  test('opens displayed reader source URL directly through launcher', () async {
    final launcher = _FakeReaderSourceLauncher();
    final store = _store(
      [summaryApiDto()],
      workspaceSummary: readerSummaryApiDto(),
      sourceLauncher: launcher,
    );

    await store.openReaderSourceUrl(
      summaryId: 'reader-summary-test',
      canonicalUrl: 'https://x.com/NVIDIAAI/status/2070654232139833720',
    );

    expect(
      launcher.opened.single.toString(),
      'https://x.com/NVIDIAAI/status/2070654232139833720',
    );
    final state = store.readerActionState as ReadyViewState<ReaderActionResult>;
    expect(state.value.kind, 'read_source');
    expect(state.value.learningDirection, 'external_source_opened');
  });

  test('summary request tolerates reentrant workspace switch', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceSummary: readerSummaryApiDto());
    var switchedScope = false;
    store.addListener(() {
      if (switchedScope) {
        return;
      }
      if (store.summaryJobState is ReadyViewState<ReaderSummaryJobSnapshot>) {
        switchedScope = true;
        store.updateScope(
          const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
        );
      }
    });

    await store.requestWorkspaceSummary();

    expect(switchedScope, isTrue);
    expect(store.scope.workspaceId, 'next');
    expect(
      store.summaryJobState,
      isA<InitialViewState<ReaderSummaryJobSnapshot>>(),
    );
    expect(
      store.workspaceSummaryState,
      isA<InitialViewState<WorkspaceSummarySnapshot>>(),
    );
  });

  test('detail load rejects stale result from older selection', () async {
    final catalog = _DeferredSummaryReviewCatalog([
      generatedSummary(id: 's-1', title: 'First summary'),
      generatedSummary(id: 's-2', title: 'Second summary'),
    ]);
    final store = _storeFromCatalog(catalog);

    await store.load();
    final first = store.selectSummary(const SummaryId('s-1'));
    final second = store.selectSummary(const SummaryId('s-2'));
    expect(catalog.pendingDetails, hasLength(2));

    catalog.pendingDetails[1].completeWith(
      generatedSummary(id: 's-2', title: 'Second detail'),
    );
    await second;

    catalog.pendingDetails[0].completeWith(
      generatedSummary(id: 's-1', title: 'First detail'),
    );
    await first;

    final detail = store.detailState as ReadyViewState<GeneratedSummary>;
    expect(detail.value.title, 'Second detail');
  });

  test('workspace switch clears summary state', () async {
    final store = _store([summaryApiDto()]);

    await store.load();
    await store.selectSummary(const SummaryId('s-1'));

    store.updateScope(
      const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
    );

    expect(
      store.listState,
      isA<InitialViewState<PageResult<GeneratedSummary>>>(),
    );
    expect(store.detailState, isA<InitialViewState<GeneratedSummary>>());
    expect(store.hasExplicitSelection, isFalse);
  });

  test('slow workspace summary does not block summary list load', () async {
    final catalog = _DeferredSummaryReviewCatalog([
      generatedSummary(id: 's-1', title: 'Stored summary'),
    ], hangWorkspaceSummary: true);
    final store = _storeFromCatalog(
      catalog,
      workspaceSummaryLoadTimeout: const Duration(milliseconds: 1),
    );

    await store.load();
    await Future<void>.delayed(const Duration(milliseconds: 5));

    final listState =
        store.listState as ReadyViewState<PageResult<GeneratedSummary>>;
    expect(listState.value.items.single.title, 'Stored summary');
    final workspaceSummaryState =
        store.workspaceSummaryState
            as FailureViewState<WorkspaceSummarySnapshot>;
    expect(
      workspaceSummaryState.failure.code,
      'summaries.workspace_summary_timeout',
    );
  });

  test('dispose invalidates pending workspace summary load', () async {
    final catalog = _DeferredSummaryReviewCatalog([
      generatedSummary(id: 's-1', title: 'Stored summary'),
    ], deferWorkspaceSummary: true);
    final store = _storeFromCatalog(catalog);

    await store.load();
    expect(catalog.pendingWorkspaceSummarys, hasLength(1));

    store.dispose();
    catalog.pendingWorkspaceSummarys.single.complete(
      const Result.success(WorkspaceSummarySnapshot()),
    );
    await Future<void>.delayed(Duration.zero);

    expect(catalog.pendingWorkspaceSummarys.single.isCompleted, isTrue);
  });
}

SummariesReviewStore _store(
  List<SummaryApiDto> items, {
  ReaderSummaryApiDto? workspaceSummary,
  ReaderSourceLauncher? sourceLauncher,
}) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(
      items: items,
      workspaceSummary: workspaceSummary,
    ),
  );
  return _storeFromCatalog(catalog, sourceLauncher: sourceLauncher);
}

SummariesReviewStore _storeFromCatalog(
  SummaryReviewCatalog catalog, {
  ReaderSourceLauncher? sourceLauncher,
  Duration workspaceSummaryLoadTimeout = const Duration(seconds: 20),
}) {
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(catalog),
      requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(catalog),
      loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitReaderAction: SubmitReaderActionUseCase(catalog),
      openReaderSource: OpenReaderSourceUseCase(
        sourceLauncher ?? _FakeReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    summaryRequestIdempotencyKeyFactory: (_, _) => 'summary-test-key',
    summaryPollInterval: Duration.zero,
    workspaceSummaryLoadTimeout: workspaceSummaryLoadTimeout,
  );
}

final class _FakeReaderSourceLauncher implements ReaderSourceLauncher {
  final opened = <Uri>[];

  @override
  Future<Result<Unit>> open(Uri uri) async {
    opened.add(uri);
    return const Result.success(Unit.value);
  }
}

final class _DeferredSummaryReviewCatalog implements SummaryReviewCatalog {
  _DeferredSummaryReviewCatalog(
    this.items, {
    this.hangWorkspaceSummary = false,
    this.deferWorkspaceSummary = false,
  });

  final List<GeneratedSummary> items;
  final bool hangWorkspaceSummary;
  final bool deferWorkspaceSummary;
  final pendingDetails = <_PendingDetailRequest>[];
  final pendingWorkspaceSummarys =
      <Completer<Result<WorkspaceSummarySnapshot>>>[];

  @override
  Future<Result<PageResult<GeneratedSummary>>> listSummaries(
    ListSummariesQuery query,
  ) {
    return Future.value(Result.success(generatedSummaryPage(items)));
  }

  @override
  Future<Result<GeneratedSummary>> loadSummaryDetail(
    LoadSummaryDetailQuery query,
  ) {
    final completer = Completer<Result<GeneratedSummary>>();
    pendingDetails.add(_PendingDetailRequest(query, completer));
    return completer.future;
  }

  @override
  Future<Result<GeneratedSummary>> regenerateSummary(
    RegenerateSummaryCommand command,
  ) {
    return Future.value(Result.success(items.first));
  }

  @override
  Future<Result<GeneratedSummary>> submitFeedback(
    SubmitSummaryFeedbackCommand command,
  ) {
    return Future.value(
      Result.success(
        generatedSummary(id: command.summaryId.value, feedbackSubmitted: true),
      ),
    );
  }

  @override
  Future<Result<ReaderActionResult>> submitReaderAction(
    SubmitReaderActionCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected reader action in test'),
      ),
    );
  }

  @override
  Future<Result<WorkspaceSummarySnapshot>> loadWorkspaceSummary(
    LoadWorkspaceSummaryQuery query,
  ) {
    if (hangWorkspaceSummary) {
      return Completer<Result<WorkspaceSummarySnapshot>>().future;
    }
    if (deferWorkspaceSummary) {
      final completer = Completer<Result<WorkspaceSummarySnapshot>>();
      pendingWorkspaceSummarys.add(completer);
      return completer.future;
    }
    return Future.value(const Result.success(WorkspaceSummarySnapshot()));
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> requestWorkspaceSummary(
    RequestWorkspaceSummaryCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected summary request in test'),
      ),
    );
  }

  @override
  Future<Result<ReaderSummaryJobSnapshot>> loadWorkspaceSummaryJobStatus(
    LoadWorkspaceSummaryJobStatusQuery query,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected summary status read in test'),
      ),
    );
  }
}

final class _PendingDetailRequest {
  const _PendingDetailRequest(this.query, this.completer);

  final LoadSummaryDetailQuery query;
  final Completer<Result<GeneratedSummary>> completer;

  void completeWith(GeneratedSummary summary) {
    completer.complete(Result.success(summary));
  }
}
