import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/reader_source_launcher.dart';
import '../../application/contracts/summary_review_catalog.dart';
import '../../application/use_cases/list_summaries_use_case.dart';
import '../../application/use_cases/load_summary_detail_use_case.dart';
import '../../application/use_cases/load_workspace_summary_job_status_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../application/use_cases/regenerate_summary_use_case.dart';
import '../../application/use_cases/request_workspace_summary_use_case.dart';
import '../../application/use_cases/submit_reader_action_use_case.dart';
import '../../application/use_cases/submit_summary_feedback_use_case.dart';
import '../../infrastructure/api/summaries_demo_api_fixtures.dart';
import '../../infrastructure/api_clients/generated_summaries_api_client.dart';
import '../../infrastructure/api_clients/in_memory_summaries_api_client.dart';
import '../../infrastructure/api_clients/summaries_api_client.dart';
import '../../infrastructure/data_sources/url_launcher_reader_source_launcher.dart';
import '../../infrastructure/repositories/generated_summary_review_catalog.dart';
import '../stores/summaries_review_store.dart';
import '../workflows/summaries_review_store_dependencies.dart';

final class SummariesFeatureModule extends Module {
  SummariesFeatureModule()
    : generatedApiRuntime = null,
      userId = 'user-demo',
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      );

  SummariesFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
    required this.userId,
  });

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final String userId;

  Object get retentionKey => 'summaries-${scope.tenantId}-${scope.workspaceId}';

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    i.registerLazySingleton<SummariesApiClient>(_createApiClient);
    i.registerLazySingleton<ReaderSourceLauncher>(
      () => const UrlLauncherReaderSourceLauncher(),
    );
    i.registerLazySingleton<SummaryReviewCatalog>(
      () =>
          GeneratedSummaryReviewCatalog(apiClient: i.get<SummariesApiClient>()),
    );
    i.registerLazySingleton(
      () => SummariesReviewStore(
        dependencies: SummariesReviewStoreDependencies(
          listSummaries: ListSummariesUseCase(i.get<SummaryReviewCatalog>()),
          loadWorkspaceSummary: LoadWorkspaceSummaryUseCase(
            i.get<SummaryReviewCatalog>(),
          ),
          requestWorkspaceSummary: RequestWorkspaceSummaryUseCase(
            i.get<SummaryReviewCatalog>(),
          ),
          loadWorkspaceSummaryJobStatus: LoadWorkspaceSummaryJobStatusUseCase(
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
          submitReaderAction: SubmitReaderActionUseCase(
            i.get<SummaryReviewCatalog>(),
          ),
          openReaderSource: OpenReaderSourceUseCase(
            i.get<ReaderSourceLauncher>(),
          ),
        ),
        scope: scope,
        userId: userId,
      ),
    );
  }

  SummariesReviewStore createStore() {
    final apiClient = _createApiClient();
    final catalog = GeneratedSummaryReviewCatalog(apiClient: apiClient);
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
          const UrlLauncherReaderSourceLauncher(),
        ),
      ),
      scope: scope,
      userId: userId,
    );
  }

  SummariesApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedSummariesApiClient.fromRuntime(runtime: runtime);
    }
    return InMemorySummariesApiClient(
      items: summariesFeatureDemoItems(),
      workspaceSummary: summariesFeatureDemoWorkspaceSummary(),
    );
  }
}
