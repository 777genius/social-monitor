import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/regenerate_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/request_workspace_briefing_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_briefing_reader_action_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_summary_feedback_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/briefing_reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/list_summaries_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_summary_detail_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_briefing_job_status_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_workspace_briefing_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_job_status_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_briefing_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/request_workspace_briefing_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_briefing_reader_action_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/entities/briefing_job_snapshot.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_briefing.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/briefing_reader_action_target.dart';
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

  test('requests workspace briefing and refreshes it after polling', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceBriefing: briefingApiDto());

    await store.requestWorkspaceBriefing();

    final jobState =
        store.briefingJobState as ReadyViewState<BriefingJobSnapshot>;
    expect(jobState.value.status, BriefingJobStatus.completed);
    final briefingState =
        store.briefingState as ReadyViewState<WorkspaceBriefingSnapshot>;
    expect(briefingState.value.current?.title, 'AI workspace summary');
    expect(store.isBriefingGenerationInProgress, isFalse);
  });

  test('submits reader relevance action from briefing top read', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceBriefing: briefingApiDto());

    await store.loadWorkspaceBriefing();

    final briefing =
        (store.briefingState as ReadyViewState<WorkspaceBriefingSnapshot>)
            .value
            .current!;
    final markRelevant = briefing.readerBrief.nextActions.firstWhere(
      (action) => action.kind == 'mark_relevant',
    );
    final watchRepository = briefing.readerBrief.nextActions.firstWhere(
      (action) => action.kind == 'watch_repository',
    );
    final readSource = briefing.readerBrief.nextActions.firstWhere(
      (action) => action.kind == 'read_source',
    );

    expect(store.readerActionIntentFor(briefing, readSource).isEnabled, true);
    expect(store.readerActionIntentFor(briefing, markRelevant).isEnabled, true);
    expect(
      store.readerActionIntentFor(briefing, watchRepository).disabledReasonCode,
      'summaries.reader_action_not_supported',
    );

    await store.submitReaderAction(briefing, markRelevant);

    final state =
        store.readerActionState as ReadyViewState<BriefingReaderActionResult>;
    expect(state.value.kind, 'mark_relevant');
    expect(state.value.learningDirection, 'positive');
    expect(state.value.idempotencyKey, contains(':mark_relevant:'));
  });

  test(
    'opens reader source action without relevance feedback target',
    () async {
      final launcher = _FakeBriefingReaderSourceLauncher();
      final store = _store(
        [summaryApiDto()],
        workspaceBriefing: briefingApiDto(),
        sourceLauncher: launcher,
      );

      await store.loadWorkspaceBriefing();

      final briefing =
          (store.briefingState as ReadyViewState<WorkspaceBriefingSnapshot>)
              .value
              .current!;
      final readSource = briefing.readerBrief.nextActions.firstWhere(
        (action) => action.kind == 'read_source',
      );

      await store.submitReaderAction(briefing, readSource);

      expect(
        launcher.opened.single.toString(),
        'https://github.com/openai/codex',
      );
      final state =
          store.readerActionState as ReadyViewState<BriefingReaderActionResult>;
      expect(state.value.kind, 'read_source');
      expect(state.value.learningDirection, 'external_source_opened');
    },
  );

  test('briefing request tolerates reentrant workspace switch', () async {
    final store = _store([
      summaryApiDto(),
    ], workspaceBriefing: briefingApiDto());
    var switchedScope = false;
    store.addListener(() {
      if (switchedScope) {
        return;
      }
      if (store.briefingJobState is ReadyViewState<BriefingJobSnapshot>) {
        switchedScope = true;
        store.updateScope(
          const WorkspaceScope(tenantId: 'tenant-demo', workspaceId: 'next'),
        );
      }
    });

    await store.requestWorkspaceBriefing();

    expect(switchedScope, isTrue);
    expect(store.scope.workspaceId, 'next');
    expect(
      store.briefingJobState,
      isA<InitialViewState<BriefingJobSnapshot>>(),
    );
    expect(
      store.briefingState,
      isA<InitialViewState<WorkspaceBriefingSnapshot>>(),
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
}

SummariesReviewStore _store(
  List<SummaryApiDto> items, {
  BriefingApiDto? workspaceBriefing,
  BriefingReaderSourceLauncher? sourceLauncher,
}) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(
      items: items,
      workspaceBriefing: workspaceBriefing,
    ),
  );
  return _storeFromCatalog(catalog, sourceLauncher: sourceLauncher);
}

SummariesReviewStore _storeFromCatalog(
  SummaryReviewCatalog catalog, {
  BriefingReaderSourceLauncher? sourceLauncher,
}) {
  return SummariesReviewStore(
    dependencies: SummariesReviewStoreDependencies(
      listSummaries: ListSummariesUseCase(catalog),
      loadWorkspaceBriefing: LoadWorkspaceBriefingUseCase(catalog),
      requestWorkspaceBriefing: RequestWorkspaceBriefingUseCase(catalog),
      loadWorkspaceBriefingJobStatus: LoadWorkspaceBriefingJobStatusUseCase(
        catalog,
      ),
      loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
      regenerateSummary: RegenerateSummaryUseCase(catalog),
      submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
      submitBriefingReaderAction: SubmitBriefingReaderActionUseCase(catalog),
      openBriefingReaderSource: OpenBriefingReaderSourceUseCase(
        sourceLauncher ?? _FakeBriefingReaderSourceLauncher(),
      ),
    ),
    scope: summaryWorkspaceScope,
    userId: 'user-test',
    briefingRequestIdempotencyKeyFactory: (_) => 'briefing-test-key',
    briefingPollInterval: Duration.zero,
  );
}

final class _FakeBriefingReaderSourceLauncher
    implements BriefingReaderSourceLauncher {
  final opened = <Uri>[];

  @override
  Future<Result<Unit>> open(Uri uri) async {
    opened.add(uri);
    return const Result.success(Unit.value);
  }
}

final class _DeferredSummaryReviewCatalog implements SummaryReviewCatalog {
  _DeferredSummaryReviewCatalog(this.items);

  final List<GeneratedSummary> items;
  final pendingDetails = <_PendingDetailRequest>[];

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
  Future<Result<BriefingReaderActionResult>> submitBriefingReaderAction(
    SubmitBriefingReaderActionCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected reader action in test'),
      ),
    );
  }

  @override
  Future<Result<WorkspaceBriefingSnapshot>> loadWorkspaceBriefing(
    LoadWorkspaceBriefingQuery query,
  ) {
    return Future.value(const Result.success(WorkspaceBriefingSnapshot()));
  }

  @override
  Future<Result<BriefingJobSnapshot>> requestWorkspaceBriefing(
    RequestWorkspaceBriefingCommand command,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected briefing request in test'),
      ),
    );
  }

  @override
  Future<Result<BriefingJobSnapshot>> loadWorkspaceBriefingJobStatus(
    LoadWorkspaceBriefingJobStatusQuery query,
  ) {
    return Future.value(
      const Result.failure(
        UnexpectedFailure(message: 'Unexpected briefing status read in test'),
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
