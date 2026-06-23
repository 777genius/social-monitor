import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/summary_review_catalog.dart';
import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/load_workspace_briefing_job_status_use_case.dart';
import '../../application/use_cases/load_workspace_briefing_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/request_workspace_briefing_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';
import '../../infrastructure/api_clients/generated_summaries_api_client.dart';
import '../../infrastructure/api_clients/in_memory_summaries_api_client.dart';
import '../../infrastructure/repositories/generated_summary_review_catalog.dart';
import '../stores/summaries_review_store.dart';
import 'summaries_feature_demo_fixtures.dart';

final class SummariesFeatureModule extends Module {
  SummariesFeatureModule()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      );

  SummariesFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
  });

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;

  Object get retentionKey => 'summaries-${scope.tenantId}-${scope.workspaceId}';

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    i.registerLazySingleton<SummariesApiClient>(_createApiClient);
    i.registerLazySingleton<SummaryReviewCatalog>(
      () =>
          GeneratedSummaryReviewCatalog(apiClient: i.get<SummariesApiClient>()),
    );
    i.registerLazySingleton(
      () => SummariesReviewStore(
        listSummaries: ListSummariesUseCase(i.get<SummaryReviewCatalog>()),
        loadWorkspaceBriefing: LoadWorkspaceBriefingUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        requestWorkspaceBriefing: RequestWorkspaceBriefingUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        loadWorkspaceBriefingJobStatus: LoadWorkspaceBriefingJobStatusUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        loadSummaryDetail: LoadSummaryDetailUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        regenerateSummary: RegenerateSummaryUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        submitFeedback: SubmitSummaryFeedbackUseCase(
          i.get<SummaryReviewCatalog>(),
        ),
        scope: scope,
      ),
    );
  }

  SummariesApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedSummariesApiClient.fromRuntime(runtime: runtime);
    }
    return InMemorySummariesApiClient(
      items: summariesFeatureDemoItems(),
      workspaceBriefing: summariesFeatureDemoBriefing(),
    );
  }
}
