import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/commands/regenerate_summary_command.dart';
import 'package:social_monitor_summaries/src/application/commands/submit_summary_feedback_command.dart';
import 'package:social_monitor_summaries/src/application/contracts/summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/application/queries/list_summaries_query.dart';
import 'package:social_monitor_summaries/src/application/queries/load_summary_detail_query.dart';
import 'package:social_monitor_summaries/src/application/use_cases/list_summaries_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_summary_detail_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/regenerate_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/submit_summary_feedback_use_case.dart';
import 'package:social_monitor_summaries/src/domain/entities/generated_summary.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_feedback_kind.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/summary_id.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/api_clients/in_memory_summaries_api_client.dart';
import 'package:social_monitor_summaries/src/infrastructure/repositories/generated_summary_review_catalog.dart';
import 'package:social_monitor_summaries/src/presentation/stores/summaries_review_store.dart';

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

SummariesReviewStore _store(List<SummaryApiDto> items) {
  final catalog = GeneratedSummaryReviewCatalog(
    apiClient: InMemorySummariesApiClient(items: items),
  );
  return _storeFromCatalog(catalog);
}

SummariesReviewStore _storeFromCatalog(SummaryReviewCatalog catalog) {
  return SummariesReviewStore(
    listSummaries: ListSummariesUseCase(catalog),
    loadSummaryDetail: LoadSummaryDetailUseCase(catalog),
    regenerateSummary: RegenerateSummaryUseCase(catalog),
    submitFeedback: SubmitSummaryFeedbackUseCase(catalog),
    scope: summaryWorkspaceScope,
  );
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
}

final class _PendingDetailRequest {
  const _PendingDetailRequest(this.query, this.completer);

  final LoadSummaryDetailQuery query;
  final Completer<Result<GeneratedSummary>> completer;

  void completeWith(GeneratedSummary summary) {
    completer.complete(Result.success(summary));
  }
}
