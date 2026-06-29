import 'package:flutter/foundation.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/queries/plan_interest_coverage_query.dart';
import '../../application/use_cases/plan_interest_coverage_use_case.dart';
import '../../domain/entities/interest_coverage_plan.dart';
import '../../domain/value_objects/source_interest_id.dart';

final class InterestCoveragePlanStore extends ChangeNotifier {
  InterestCoveragePlanStore({
    required PlanInterestCoverageUseCase planInterestCoverage,
    required WorkspaceScope scope,
    required SourceInterestId interestId,
    required this.interestTitle,
    OperationGenerationGuard? planGuard,
  }) : _planInterestCoverage = planInterestCoverage,
       _scope = scope,
       _interestId = interestId,
       _planGuard = planGuard ?? OperationGenerationGuard();

  final PlanInterestCoverageUseCase _planInterestCoverage;
  final OperationGenerationGuard _planGuard;

  WorkspaceScope _scope;
  SourceInterestId _interestId;

  final String interestTitle;

  AsyncViewState<InterestCoveragePlan> planState =
      const InitialViewState<InterestCoveragePlan>();

  WorkspaceScope get scope => _scope;

  SourceInterestId get interestId => _interestId;

  UserActionIntent get planIntent {
    return UserActionIntent(
      id: 'interest_coverage_plan.plan',
      idempotencyKey: '${_scope.workspaceId}:${_interestId.value}:plan',
      disabledReasonCode: _scope.isValid && _interestId.isValid
          ? null
          : 'interest_coverage_plan.scope_invalid',
    );
  }

  void updateScope({
    required WorkspaceScope scope,
    required SourceInterestId interestId,
  }) {
    if (scope == _scope && interestId == _interestId) {
      return;
    }
    _scope = scope;
    _interestId = interestId;
    _planGuard.invalidate();
    planState = const InitialViewState<InterestCoveragePlan>();
    notifyListeners();
  }

  Future<void> plan({
    String? description,
    List<String> keywords = const [],
    List<String> subreddits = const [],
    List<String> rssFeedUrls = const [],
  }) async {
    if (!planIntent.isEnabled) {
      planState = FailureViewState<InterestCoveragePlan>(
        failure: ValidationFailure(
          message: 'Valid workspace and interest are required',
          code: planIntent.disabledReasonCode,
        ),
      );
      notifyListeners();
      return;
    }

    final generation = _planGuard.markOperationStarted();
    final previous = switch (planState) {
      ReadyViewState<InterestCoveragePlan>(:final value) => value,
      _ => null,
    };
    planState = LoadingViewState<InterestCoveragePlan>(previousValue: previous);
    notifyListeners();

    final result = await _planInterestCoverage(
      PlanInterestCoverageQuery(
        scope: _scope,
        interestId: _interestId,
        description: description ?? interestTitle,
        keywords: keywords,
        subreddits: subreddits,
        rssFeedUrls: rssFeedUrls,
      ),
    );
    if (!_planGuard.isCurrent(generation)) {
      return;
    }
    planState = result.fold(
      onSuccess: (plan) {
        if (plan.drafts.isEmpty) {
          return const EmptyViewState<InterestCoveragePlan>(
            reason: 'interest_coverage_plan.no_drafts',
          );
        }
        return ReadyViewState<InterestCoveragePlan>(plan);
      },
      onFailure: (failure) =>
          FailureViewState<InterestCoveragePlan>(failure: failure),
    );
    notifyListeners();
  }
}
