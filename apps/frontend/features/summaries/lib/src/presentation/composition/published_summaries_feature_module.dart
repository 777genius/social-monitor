import 'dart:async';

import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/load_published_summary_use_case.dart';
import '../../application/use_cases/load_workspace_summary_history_use_case.dart';
import '../../application/use_cases/load_workspace_summary_use_case.dart';
import '../../application/use_cases/open_reader_source_use_case.dart';
import '../../infrastructure/api_clients/generated_summaries_api_client.dart';
import '../../infrastructure/data_sources/callback_reader_source_launcher.dart';
import '../../infrastructure/data_sources/url_launcher_reader_source_launcher.dart';
import '../../infrastructure/repositories/generated_summary_review_catalog.dart';
import '../stores/published_summary_store.dart';

final class PublishedSummariesFeatureModule extends Module {
  PublishedSummariesFeatureModule({
    required this.generatedApiRuntime,
    required this.scope,
    this.summaryId,
    this.onSummarySelected,
    this.onOpenReaderSource,
  });

  final Object generatedApiRuntime;
  final WorkspaceScope scope;
  final String? summaryId;
  final void Function(String summaryId)? onSummarySelected;
  final FutureOr<void> Function(Uri uri)? onOpenReaderSource;

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
      onSummarySelected: onSummarySelected,
      loadLatest: LoadWorkspaceSummaryUseCase(catalog),
      loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      loadPublished: LoadPublishedSummaryUseCase(catalog),
      openReaderSource: OpenReaderSourceUseCase(switch (onOpenReaderSource) {
        final callback? => CallbackReaderSourceLauncher(callback),
        null => const UrlLauncherReaderSourceLauncher(),
      }),
    );
  }
}
