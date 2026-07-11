import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_published_summary_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../infrastructure/api_clients/generated_summaries_api_client.dart';
import '../../infrastructure/data_sources/url_launcher_reader_source_launcher.dart';
import '../../infrastructure/repositories/generated_summary_review_catalog.dart';
import '../stores/published_summary_store.dart';

final class PublishedSummariesFeatureModule extends Module {
  PublishedSummariesFeatureModule({
    required this.generatedApiRuntime,
    required this.scope,
    this.summaryId,
  });

  final Object generatedApiRuntime;
  final WorkspaceScope scope;
  final String? summaryId;

  Object get retentionKey =>
      'published-summary-${scope.tenantId}-${scope.workspaceId}-${summaryId ?? 'latest'}';

  @override
  void binds(Binder i) {}

  PublishedSummaryStore createStore() {
    final catalog = GeneratedSummaryReviewCatalog(
      apiClient: GeneratedSummariesApiClient.fromRuntime(
        runtime: generatedApiRuntime,
      ),
    );
    return PublishedSummaryStore(
      scope: scope,
      summaryId: summaryId,
      loadLatest: LoadWorkspaceSummaryUseCase(catalog),
      loadPublished: LoadPublishedSummaryUseCase(catalog),
      openReaderSource: OpenReaderSourceUseCase(
        const UrlLauncherReaderSourceLauncher(),
      ),
    );
  }
}
