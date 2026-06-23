import 'package:flutter/widgets.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/use_cases/connect_source_use_case.dart';
import '../../application/use_cases/list_sources_use_case.dart';
import '../../application/use_cases/load_source_health_use_case.dart';
import '../../application/use_cases/pause_source_use_case.dart';
import '../../application/use_cases/reconnect_source_use_case.dart';
import '../../application/use_cases/resume_source_use_case.dart';
import '../../infrastructure/api/source_summary_api_dto.dart';
import '../../infrastructure/api_clients/in_memory_sources_api_client.dart';
import '../../infrastructure/repositories/generated_source_catalog.dart';
import '../pages/sources_feature_page.dart';
import '../stores/sources_catalog_store.dart';

class SourcesFeatureModuleHost extends StatefulWidget {
  const SourcesFeatureModuleHost({super.key});

  @override
  State<SourcesFeatureModuleHost> createState() =>
      _SourcesFeatureModuleHostState();
}

class _SourcesFeatureModuleHostState extends State<SourcesFeatureModuleHost> {
  late final SourcesCatalogStore _store;

  @override
  void initState() {
    super.initState();
    final catalog = GeneratedSourceCatalog(
      apiClient: InMemorySourcesApiClient(items: _demoSources),
    );
    _store = SourcesCatalogStore(
      listSources: ListSourcesUseCase(catalog),
      connectSource: ConnectSourceUseCase(catalog),
      reconnectSource: ReconnectSourceUseCase(catalog),
      pauseSource: PauseSourceUseCase(catalog),
      resumeSource: ResumeSourceUseCase(catalog),
      loadSourceHealth: LoadSourceHealthUseCase(catalog),
      scope: const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
    );
  }

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SourcesFeaturePage(store: _store);
  }
}

const _demoSources = [
  SourceSummaryApiDto(
    id: 'reddit',
    name: 'Reddit',
    credentialHealth: 'healthy',
    healthLabel: 'Healthy',
    capabilityKey: 'sources.reddit',
    capabilityEnabled: true,
    collectionStatus: 'collecting',
  ),
  SourceSummaryApiDto(
    id: 'rss',
    name: 'RSS feeds',
    credentialHealth: 'expired',
    healthLabel: 'OAuth token expired',
    capabilityKey: 'sources.rss',
    capabilityEnabled: true,
    collectionStatus: 'collecting',
    credentialPreview: 'redacted-token-preview',
  ),
  SourceSummaryApiDto(
    id: 'hn',
    name: 'Hacker News',
    credentialHealth: 'healthy',
    healthLabel: 'Healthy',
    capabilityKey: 'sources.hacker_news',
    capabilityEnabled: false,
    collectionStatus: 'paused',
    capabilityDisabledReasonCode: 'provider_beta_disabled',
  ),
];
