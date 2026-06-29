import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_sources/src/application/use_cases/plan_interest_coverage_use_case.dart';
import 'package:social_monitor_sources/src/domain/entities/interest_coverage_plan.dart';
import 'package:social_monitor_sources/src/domain/value_objects/interest_coverage_plan_draft_status.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_interest_id.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_interest_coverage_plans_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_interest_coverage_plan_catalog.dart';
import 'package:social_monitor_sources/src/presentation/stores/interest_coverage_plan_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  test('plans source drafts for the current interest', () async {
    final store = _store();

    await store.plan(keywords: const ['pricing']);

    final state = store.planState as ReadyViewState<InterestCoveragePlan>;
    expect(
      state.value.interestId,
      const SourceInterestId('interest-competitor'),
    );
    expect(
      state.value.drafts.single.status,
      InterestCoveragePlanDraftStatus.ready,
    );
    expect(state.value.drafts.single.canApply, isTrue);
    expect(
      state.value.drafts.single.sourceBindingDraft?.config['scanPasses'],
      isA<List<Object?>>(),
    );
  });

  test(
    'rejects invalid workspace before calling coverage plan catalog',
    () async {
      final catalog = GeneratedInterestCoveragePlanCatalog(
        apiClient: InMemoryInterestCoveragePlansApiClient(
          plan: interestCoveragePlanApiDto(),
        ),
      );
      final store = InterestCoveragePlanStore(
        planInterestCoverage: PlanInterestCoverageUseCase(catalog),
        scope: const WorkspaceScope(tenantId: '', workspaceId: ''),
        interestId: const SourceInterestId('interest-competitor'),
        interestTitle: 'Competitor launches',
      );

      await store.plan();

      final state = store.planState as FailureViewState<InterestCoveragePlan>;
      expect(state.failure.code, 'interest_coverage_plan.scope_invalid');
    },
  );
}

InterestCoveragePlanStore _store() {
  final catalog = GeneratedInterestCoveragePlanCatalog(
    apiClient: InMemoryInterestCoveragePlansApiClient(
      plan: interestCoveragePlanApiDto(),
    ),
  );
  return InterestCoveragePlanStore(
    planInterestCoverage: PlanInterestCoverageUseCase(catalog),
    scope: sourceWorkspaceScope,
    interestId: const SourceInterestId('interest-competitor'),
    interestTitle: 'Competitor launches',
  );
}
