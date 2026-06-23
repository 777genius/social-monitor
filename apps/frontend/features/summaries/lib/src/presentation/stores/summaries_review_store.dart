import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';

final class SummariesReviewStore extends ChangeNotifier {
  SummariesReviewStore({
    required ListSummariesUseCase listSummaries,
    required LoadSummaryDetailUseCase loadSummaryDetail,
    required RegenerateSummaryUseCase regenerateSummary,
    required SubmitSummaryFeedbackUseCase submitFeedback,
    required WorkspaceScope scope,
    OperationGenerationGuard? listGenerationGuard,
    OperationGenerationGuard? detailGenerationGuard,
    OperationGenerationGuard? mutationGenerationGuard,
  }) : _listSummaries = listSummaries,
       _loadSummaryDetail = loadSummaryDetail,
       _regenerateSummary = regenerateSummary,
       _submitFeedback = submitFeedback,
       _scope = scope,
       _listGenerationGuard = listGenerationGuard ?? OperationGenerationGuard(),
       _detailGenerationGuard =
           detailGenerationGuard ?? OperationGenerationGuard(),
       _mutationGenerationGuard =
           mutationGenerationGuard ?? OperationGenerationGuard();

  final ListSummariesUseCase _listSummaries;
  final LoadSummaryDetailUseCase _loadSummaryDetail;
  final RegenerateSummaryUseCase _regenerateSummary;
  final SubmitSummaryFeedbackUseCase _submitFeedback;
  final OperationGenerationGuard _listGenerationGuard;
  final OperationGenerationGuard _detailGenerationGuard;
  final OperationGenerationGuard _mutationGenerationGuard;

  WorkspaceScope _scope;
  SummaryId? _selectedSummaryId;

  AsyncViewState<PageResult<GeneratedSummary>> listState =
      const InitialViewState<PageResult<GeneratedSummary>>();
  AsyncViewState<GeneratedSummary> detailState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> regenerationState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> feedbackState =
      const InitialViewState<GeneratedSummary>();

  WorkspaceScope get scope => _scope;

  bool get hasExplicitSelection => _selectedSummaryId != null;

  GeneratedSummary? get selectedSummary {
    final detail = detailState;
    final selectedId = _selectedSummaryId;
    if (detail is ReadyViewState<GeneratedSummary> &&
        (selectedId == null || detail.value.id == selectedId)) {
      return detail.value;
    }

    final list = listState;
    if (list is! ReadyViewState<PageResult<GeneratedSummary>>) {
      return null;
    }
    for (final summary in list.value.items) {
      if (summary.id == selectedId) {
        return summary;
      }
    }
    return list.value.items.firstOrNull;
  }

  UserActionIntent regenerationIntentFor(GeneratedSummary summary) {
    final disabledReasonCode = switch (summary.status) {
      SummaryGenerationStatus.generating => 'summaries.generation_in_progress',
      SummaryGenerationStatus.unknown => 'summaries.status_unknown',
      _ => null,
    };
    return UserActionIntent(
      id: 'summaries.regenerate',
      disabledReasonCode: disabledReasonCode,
      idempotencyKey: '${_scope.workspaceId}:${summary.id.value}:regenerate',
    );
  }

  UserActionIntent feedbackIntentFor(
    GeneratedSummary summary,
    SummaryFeedbackKind kind,
  ) {
    return UserActionIntent(
      id: 'summaries.feedback.${kind.name}',
      disabledReasonCode: summary.feedbackSubmitted
          ? 'summaries.feedback_submitted'
          : null,
      idempotencyKey: '${_scope.workspaceId}:${summary.id.value}:${kind.name}',
    );
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _listGenerationGuard.invalidate();
    _detailGenerationGuard.invalidate();
    _mutationGenerationGuard.invalidate();
    _selectedSummaryId = null;
    listState = const InitialViewState<PageResult<GeneratedSummary>>();
    detailState = const InitialViewState<GeneratedSummary>();
    regenerationState = const InitialViewState<GeneratedSummary>();
    feedbackState = const InitialViewState<GeneratedSummary>();
    notifyListeners();
  }

  void clearSelection() {
    if (_selectedSummaryId == null) {
      return;
    }
    _selectedSummaryId = null;
    detailState = const InitialViewState<GeneratedSummary>();
    notifyListeners();
  }

  Future<void> load() async {
    final generation = _listGenerationGuard.markOperationStarted();
    final previous = switch (listState) {
      ReadyViewState<PageResult<GeneratedSummary>>(:final value) => value,
      LoadingViewState<PageResult<GeneratedSummary>>(:final previousValue) =>
        previousValue,
      _ => null,
    };
    listState = LoadingViewState<PageResult<GeneratedSummary>>(
      previousValue: previous,
    );
    notifyListeners();

    final result = await _listSummaries(ListSummariesQuery(scope: _scope));
    if (!_listGenerationGuard.isCurrent(generation)) {
      return;
    }

    listState = result.fold(
      onSuccess: (page) {
        if (page.items.isEmpty) {
          _selectedSummaryId = null;
          detailState = const InitialViewState<GeneratedSummary>();
          return const EmptyViewState<PageResult<GeneratedSummary>>(
            reason: 'summaries.empty',
          );
        }
        _clearSelectionIfMissing(page.items);
        return ReadyViewState<PageResult<GeneratedSummary>>(
          PageResult<GeneratedSummary>(
            items: page.items,
            request: page.request,
            nextCursor: page.nextCursor,
            isPartial: page.isPartial,
          ),
        );
      },
      onFailure: (failure) =>
          FailureViewState<PageResult<GeneratedSummary>>(failure: failure),
    );
    notifyListeners();
  }

  bool selectSummaryById(SummaryId summaryId) {
    final list = listState;
    if (list is! ReadyViewState<PageResult<GeneratedSummary>>) {
      return false;
    }
    final exists = list.value.items.any((summary) => summary.id == summaryId);
    if (!exists) {
      return false;
    }
    selectSummary(summaryId);
    return true;
  }

  Future<void> selectSummary(SummaryId summaryId) async {
    _selectedSummaryId = summaryId;
    notifyListeners();
    await loadDetail(summaryId);
  }

  Future<void> loadDetail(SummaryId summaryId) async {
    final generation = _detailGenerationGuard.markOperationStarted();
    final previous = switch (detailState) {
      ReadyViewState<GeneratedSummary>(:final value) => value,
      LoadingViewState<GeneratedSummary>(:final previousValue) => previousValue,
      _ => null,
    };
    detailState = LoadingViewState<GeneratedSummary>(previousValue: previous);
    notifyListeners();

    final result = await _loadSummaryDetail(
      LoadSummaryDetailQuery(scope: _scope, summaryId: summaryId),
    );
    if (!_detailGenerationGuard.isCurrent(generation)) {
      return;
    }

    detailState = result.fold(
      onSuccess: (summary) {
        _upsertSummary(summary);
        return ReadyViewState<GeneratedSummary>(summary);
      },
      onFailure: (failure) =>
          FailureViewState<GeneratedSummary>(failure: failure),
    );
    notifyListeners();
  }

  Future<void> regenerate(GeneratedSummary summary) async {
    final intent = regenerationIntentFor(summary);
    if (!intent.isEnabled) {
      return;
    }
    await _mutate(
      loading: (previous) {
        regenerationState = LoadingViewState<GeneratedSummary>(
          previousValue: previous,
        );
      },
      run: () => _regenerateSummary(
        RegenerateSummaryCommand(scope: _scope, summaryId: summary.id),
      ),
      apply: (result) {
        regenerationState = result.fold(
          onSuccess: (updated) {
            _upsertSummary(updated);
            return ReadyViewState<GeneratedSummary>(updated);
          },
          onFailure: (failure) =>
              FailureViewState<GeneratedSummary>(failure: failure),
        );
      },
    );
  }

  Future<void> submitFeedback(
    GeneratedSummary summary,
    SummaryFeedbackKind kind,
  ) async {
    final intent = feedbackIntentFor(summary, kind);
    if (!intent.isEnabled) {
      return;
    }
    await _mutate(
      loading: (previous) {
        feedbackState = LoadingViewState<GeneratedSummary>(
          previousValue: previous,
        );
      },
      run: () => _submitFeedback(
        SubmitSummaryFeedbackCommand(
          scope: _scope,
          summaryId: summary.id,
          kind: kind,
        ),
      ),
      apply: (result) {
        feedbackState = result.fold(
          onSuccess: (updated) {
            _upsertSummary(updated);
            return ReadyViewState<GeneratedSummary>(updated);
          },
          onFailure: (failure) =>
              FailureViewState<GeneratedSummary>(failure: failure),
        );
      },
    );
  }

  Future<void> _mutate({
    required void Function(GeneratedSummary? previous) loading,
    required Future<Result<GeneratedSummary>> Function() run,
    required void Function(Result<GeneratedSummary> result) apply,
  }) async {
    final generation = _mutationGenerationGuard.markOperationStarted();
    loading(selectedSummary);
    notifyListeners();

    final result = await run();
    if (!_mutationGenerationGuard.isCurrent(generation)) {
      return;
    }

    apply(result);
    notifyListeners();
  }

  void _upsertSummary(GeneratedSummary updated) {
    final list = listState;
    if (list is ReadyViewState<PageResult<GeneratedSummary>>) {
      listState = ReadyViewState<PageResult<GeneratedSummary>>(
        PageResult<GeneratedSummary>(
          items: [
            for (final summary in list.value.items)
              summary.id == updated.id ? updated : summary,
          ],
          request: list.value.request,
          nextCursor: list.value.nextCursor,
          isPartial: list.value.isPartial,
        ),
      );
    }
    if (_selectedSummaryId == updated.id ||
        (_selectedSummaryId == null && selectedSummary?.id == updated.id)) {
      detailState = ReadyViewState<GeneratedSummary>(updated);
    }
  }

  void _clearSelectionIfMissing(List<GeneratedSummary> items) {
    final selectedId = _selectedSummaryId;
    if (selectedId == null) {
      return;
    }
    final exists = items.any((summary) => summary.id == selectedId);
    if (!exists) {
      _selectedSummaryId = null;
      detailState = const InitialViewState<GeneratedSummary>();
    }
  }
}
