import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/commands/open_briefing_reader_source_command.dart';
import '../../application/commands/regenerate_summary_command.dart';
import '../../application/commands/request_workspace_briefing_command.dart';
import '../../application/commands/submit_briefing_reader_action_command.dart';
import '../../application/commands/submit_summary_feedback_command.dart';
import '../../application/queries/list_summaries_query.dart';
import '../../application/queries/load_summary_detail_query.dart';
import '../../application/queries/load_workspace_briefing_job_status_query.dart';
import '../../application/queries/load_workspace_briefing_query.dart';
import '../../domain/entities/briefing_job_snapshot.dart';
import '../../domain/entities/generated_briefing.dart';
import '../../domain/entities/generated_summary.dart';
import '../../domain/value_objects/briefing_reader_action_target.dart';
import '../../domain/value_objects/summary_feedback_kind.dart';
import '../../domain/value_objects/summary_generation_status.dart';
import '../../domain/value_objects/summary_id.dart';
import '../workflows/summaries_review_store_dependencies.dart';

part 'summaries_review_store_briefing_workflow.dart';
part 'summaries_review_store_reader_action_workflow.dart';
part 'summaries_review_store_summary_workflow.dart';

typedef BriefingRequestIdempotencyKeyFactory =
    String Function(WorkspaceScope scope);

final class SummariesReviewStore extends ChangeNotifier {
  SummariesReviewStore({
    required SummariesReviewStoreDependencies dependencies,
    required WorkspaceScope scope,
    required String userId,
    BriefingRequestIdempotencyKeyFactory? briefingRequestIdempotencyKeyFactory,
    Duration briefingPollInterval = const Duration(seconds: 2),
    int briefingPollAttempts = 12,
    OperationGenerationGuard? listGenerationGuard,
    OperationGenerationGuard? briefingGenerationGuard,
    OperationGenerationGuard? detailGenerationGuard,
    OperationGenerationGuard? mutationGenerationGuard,
    OperationGenerationGuard? readerActionGenerationGuard,
    BriefingReaderActionTargetResolver readerActionTargetResolver =
        const BriefingReaderActionTargetResolver(),
  }) : _dependencies = dependencies,
       _scope = scope,
       _userId = userId,
       _briefingRequestIdempotencyKeyFactory =
           briefingRequestIdempotencyKeyFactory ??
           _defaultBriefingRequestIdempotencyKey,
       _briefingPollInterval = briefingPollInterval,
       _briefingPollAttempts = briefingPollAttempts,
       _listGenerationGuard = listGenerationGuard ?? OperationGenerationGuard(),
       _briefingGenerationGuard =
           briefingGenerationGuard ?? OperationGenerationGuard(),
       _detailGenerationGuard =
           detailGenerationGuard ?? OperationGenerationGuard(),
       _mutationGenerationGuard =
           mutationGenerationGuard ?? OperationGenerationGuard(),
       _readerActionGenerationGuard =
           readerActionGenerationGuard ?? OperationGenerationGuard(),
       _readerActionTargetResolver = readerActionTargetResolver;

  final SummariesReviewStoreDependencies _dependencies;
  final BriefingRequestIdempotencyKeyFactory
  _briefingRequestIdempotencyKeyFactory;
  final BriefingReaderActionTargetResolver _readerActionTargetResolver;
  final Duration _briefingPollInterval;
  final int _briefingPollAttempts;
  final OperationGenerationGuard _listGenerationGuard;
  final OperationGenerationGuard _briefingGenerationGuard;
  final OperationGenerationGuard _detailGenerationGuard;
  final OperationGenerationGuard _mutationGenerationGuard;
  final OperationGenerationGuard _readerActionGenerationGuard;

  WorkspaceScope _scope;
  final String _userId;
  SummaryId? _selectedSummaryId;
  String? _activeReaderActionIdempotencyKey;
  String? _lastReaderActionIdempotencyKey;

  AsyncViewState<PageResult<GeneratedSummary>> listState =
      const InitialViewState<PageResult<GeneratedSummary>>();
  AsyncViewState<WorkspaceBriefingSnapshot> briefingState =
      const InitialViewState<WorkspaceBriefingSnapshot>();
  AsyncViewState<BriefingJobSnapshot> briefingJobState =
      const InitialViewState<BriefingJobSnapshot>();
  AsyncViewState<GeneratedSummary> detailState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> regenerationState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<GeneratedSummary> feedbackState =
      const InitialViewState<GeneratedSummary>();
  AsyncViewState<BriefingReaderActionResult> readerActionState =
      const InitialViewState<BriefingReaderActionResult>();

  WorkspaceScope get scope => _scope;

  String? get activeReaderActionIdempotencyKey =>
      _activeReaderActionIdempotencyKey;

  String? get lastReaderActionIdempotencyKey => _lastReaderActionIdempotencyKey;

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

  void _notifyStateChanged() {
    notifyListeners();
  }

  void updateScope(WorkspaceScope nextScope) {
    if (nextScope == _scope) {
      return;
    }
    _scope = nextScope;
    _listGenerationGuard.invalidate();
    _briefingGenerationGuard.invalidate();
    _detailGenerationGuard.invalidate();
    _mutationGenerationGuard.invalidate();
    _readerActionGenerationGuard.invalidate();
    _selectedSummaryId = null;
    listState = const InitialViewState<PageResult<GeneratedSummary>>();
    briefingState = const InitialViewState<WorkspaceBriefingSnapshot>();
    briefingJobState = const InitialViewState<BriefingJobSnapshot>();
    detailState = const InitialViewState<GeneratedSummary>();
    regenerationState = const InitialViewState<GeneratedSummary>();
    feedbackState = const InitialViewState<GeneratedSummary>();
    readerActionState = const InitialViewState<BriefingReaderActionResult>();
    _activeReaderActionIdempotencyKey = null;
    _lastReaderActionIdempotencyKey = null;
    notifyListeners();
  }

  Future<void> load() async {
    await loadWorkspaceBriefing();

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

    final result = await _dependencies.listSummaries(
      ListSummariesQuery(scope: _scope),
    );
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

  Future<void> loadWorkspaceBriefing() async {
    final generation = _briefingGenerationGuard.markOperationStarted();
    await _loadWorkspaceBriefingForStore(this, generation);
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
