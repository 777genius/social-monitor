import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/scan_policy_catalog.dart';
import '../../application/contracts/scan_run_catalog.dart';
import '../../application/contracts/source_binding_catalog.dart';
import '../../application/contracts/source_catalog.dart';
import '../../application/contracts/source_profile_catalog.dart';
import '../../application/use_cases/bind_source_to_topic_use_case.dart';
import '../../application/use_cases/change_source_binding_status_use_case.dart';
import '../../application/use_cases/connect_source_use_case.dart';
import '../../application/use_cases/list_source_bindings_use_case.dart';
import '../../application/use_cases/list_source_profiles_use_case.dart';
import '../../application/use_cases/list_sources_use_case.dart';
import '../../application/use_cases/load_scan_policy_use_case.dart';
import '../../application/use_cases/load_scan_status_use_case.dart';
import '../../application/use_cases/load_source_binding_health_use_case.dart';
import '../../application/use_cases/load_source_health_use_case.dart';
import '../../application/use_cases/pause_source_use_case.dart';
import '../../application/use_cases/reconnect_source_use_case.dart';
import '../../application/use_cases/request_scan_use_case.dart';
import '../../application/use_cases/resume_source_use_case.dart';
import '../../application/use_cases/set_scan_policy_use_case.dart';
import '../../domain/value_objects/source_topic_id.dart';
import '../../infrastructure/api_clients/generated_scan_policies_api_client.dart';
import '../../infrastructure/api_clients/generated_scan_runs_api_client.dart';
import '../../infrastructure/api_clients/generated_source_bindings_api_client.dart';
import '../../infrastructure/api_clients/generated_source_profiles_api_client.dart';
import '../../infrastructure/api_clients/in_memory_scan_policies_api_client.dart';
import '../../infrastructure/api_clients/in_memory_scan_runs_api_client.dart';
import '../../infrastructure/api_clients/in_memory_source_bindings_api_client.dart';
import '../../infrastructure/api_clients/in_memory_source_profiles_api_client.dart';
import '../../infrastructure/api_clients/in_memory_sources_api_client.dart';
import '../../infrastructure/api_clients/scan_policies_api_client.dart';
import '../../infrastructure/api_clients/scan_runs_api_client.dart';
import '../../infrastructure/api_clients/source_bindings_api_client.dart';
import '../../infrastructure/api_clients/source_profiles_api_client.dart';
import '../../infrastructure/repositories/generated_scan_policy_catalog.dart';
import '../../infrastructure/repositories/generated_scan_run_catalog.dart';
import '../../infrastructure/repositories/generated_source_binding_catalog.dart';
import '../../infrastructure/repositories/generated_source_catalog.dart';
import '../../infrastructure/repositories/generated_source_profile_catalog.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import '../stores/source_profiles_store.dart';
import '../stores/sources_catalog_store.dart';
import 'sources_feature_demo_fixtures.dart';

enum SourcesFeatureWorkflow { catalogDemo, sourceProfiles, sourceBindings }

final class SourcesFeatureModule extends Module {
  SourcesFeatureModule()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      workflow = SourcesFeatureWorkflow.catalogDemo,
      sourceBindingTopicId = const SourceTopicId('topic-demo'),
      sourceBindingTopicTitle = 'Demo topic';

  SourcesFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
  }) : workflow = SourcesFeatureWorkflow.sourceProfiles,
       sourceBindingTopicId = const SourceTopicId('topic-demo'),
       sourceBindingTopicTitle = 'Demo topic';

  SourcesFeatureModule.sourceProfilesDemo()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      workflow = SourcesFeatureWorkflow.sourceProfiles,
      sourceBindingTopicId = const SourceTopicId('topic-demo'),
      sourceBindingTopicTitle = 'Demo topic';

  SourcesFeatureModule.sourceBindings({
    required this.generatedApiRuntime,
    required this.scope,
    required this.sourceBindingTopicId,
    required this.sourceBindingTopicTitle,
  }) : workflow = SourcesFeatureWorkflow.sourceBindings;

  SourcesFeatureModule.sourceBindingsDemo({
    required this.sourceBindingTopicId,
    required this.sourceBindingTopicTitle,
  }) : generatedApiRuntime = null,
       scope = const WorkspaceScope(
         tenantId: 'tenant-demo',
         workspaceId: 'ws-demo',
       ),
       workflow = SourcesFeatureWorkflow.sourceBindings;

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final SourcesFeatureWorkflow workflow;
  final SourceTopicId sourceBindingTopicId;
  final String sourceBindingTopicTitle;

  bool get showSourceProfiles =>
      workflow == SourcesFeatureWorkflow.sourceProfiles;

  bool get showSourceBindings =>
      workflow == SourcesFeatureWorkflow.sourceBindings;

  Object get retentionKey {
    return switch (workflow) {
      SourcesFeatureWorkflow.catalogDemo => 'sources-demo',
      SourcesFeatureWorkflow.sourceProfiles =>
        'source-profiles-${scope.tenantId}-${scope.workspaceId}',
      SourcesFeatureWorkflow.sourceBindings =>
        'source-bindings-${scope.tenantId}-${scope.workspaceId}-${sourceBindingTopicId.value}',
    };
  }

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    if (showSourceBindings) {
      _bindSourceBindings(i);
      return;
    }
    if (showSourceProfiles) {
      _bindSourceProfiles(i);
      return;
    }
    _bindSourceCatalog(i);
  }

  void _bindSourceProfiles(Binder i) {
    i.registerLazySingleton<SourceProfilesApiClient>(_createProfilesApiClient);
    i.registerLazySingleton<SourceProfileCatalog>(
      () => GeneratedSourceProfileCatalog(
        apiClient: i.get<SourceProfilesApiClient>(),
      ),
    );
    i.registerLazySingleton(
      () => SourceProfilesStore(
        listSourceProfiles: ListSourceProfilesUseCase(
          i.get<SourceProfileCatalog>(),
        ),
        scope: scope,
      ),
    );
  }

  void _bindSourceBindings(Binder i) {
    i.registerLazySingleton<SourceBindingsApiClient>(_createBindingsApiClient);
    i.registerLazySingleton<SourceBindingCatalog>(
      () => GeneratedSourceBindingCatalog(
        apiClient: i.get<SourceBindingsApiClient>(),
      ),
    );
    i.registerLazySingleton<ScanPoliciesApiClient>(
      _createScanPoliciesApiClient,
    );
    i.registerLazySingleton<ScanPolicyCatalog>(
      () =>
          GeneratedScanPolicyCatalog(apiClient: i.get<ScanPoliciesApiClient>()),
    );
    i.registerLazySingleton<ScanRunsApiClient>(_createScanRunsApiClient);
    i.registerLazySingleton<ScanRunCatalog>(
      () => GeneratedScanRunCatalog(apiClient: i.get<ScanRunsApiClient>()),
    );
    i.registerLazySingleton(
      () => SourceBindingsStore(
        listSourceBindings: ListSourceBindingsUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        bindSourceToTopic: BindSourceToTopicUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        changeSourceBindingStatus: ChangeSourceBindingStatusUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        loadSourceBindingHealth: LoadSourceBindingHealthUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        scope: scope,
        topicId: sourceBindingTopicId,
        topicTitle: sourceBindingTopicTitle,
      ),
    );
    i.registerLazySingleton(
      () => ScanPolicyStore(
        loadScanPolicy: LoadScanPolicyUseCase(i.get<ScanPolicyCatalog>()),
        setScanPolicy: SetScanPolicyUseCase(i.get<ScanPolicyCatalog>()),
        scope: scope,
      ),
    );
    i.registerLazySingleton(
      () => ScanRunStore(
        requestScan: RequestScanUseCase(i.get<ScanRunCatalog>()),
        loadScanStatus: LoadScanStatusUseCase(i.get<ScanRunCatalog>()),
        scope: scope,
      ),
    );
  }

  void _bindSourceCatalog(Binder i) {
    i.registerLazySingleton<SourcesApiClient>(
      () => InMemorySourcesApiClient(items: sourceDemoSources),
    );
    i.registerLazySingleton<SourceCatalog>(
      () => GeneratedSourceCatalog(apiClient: i.get<SourcesApiClient>()),
    );
    i.registerLazySingleton(
      () => SourcesCatalogStore(
        listSources: ListSourcesUseCase(i.get<SourceCatalog>()),
        connectSource: ConnectSourceUseCase(i.get<SourceCatalog>()),
        reconnectSource: ReconnectSourceUseCase(i.get<SourceCatalog>()),
        pauseSource: PauseSourceUseCase(i.get<SourceCatalog>()),
        resumeSource: ResumeSourceUseCase(i.get<SourceCatalog>()),
        loadSourceHealth: LoadSourceHealthUseCase(i.get<SourceCatalog>()),
        scope: scope,
      ),
    );
  }

  SourceProfilesApiClient _createProfilesApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedSourceProfilesApiClient.fromRuntime(runtime: runtime);
    }
    return const InMemorySourceProfilesApiClient(items: sourceDemoProfiles);
  }

  SourceBindingsApiClient _createBindingsApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedSourceBindingsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemorySourceBindingsApiClient(items: sourceDemoBindings);
  }

  ScanPoliciesApiClient _createScanPoliciesApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedScanPoliciesApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryScanPoliciesApiClient(items: sourceDemoScanPolicies);
  }

  ScanRunsApiClient _createScanRunsApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedScanRunsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryScanRunsApiClient(statuses: sourceDemoScanStatuses);
  }
}
