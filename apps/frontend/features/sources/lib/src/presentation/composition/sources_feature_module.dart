import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/interest_coverage_plan_catalog.dart';
import '../../application/contracts/scan_policy_catalog.dart';
import '../../application/contracts/scan_run_catalog.dart';
import '../../application/contracts/source_binding_catalog.dart';
import '../../application/contracts/source_profile_catalog.dart';
import '../../application/use_cases/bind_source_to_interest_use_case.dart';
import '../../application/use_cases/change_source_binding_status_use_case.dart';
import '../../application/use_cases/list_source_bindings_use_case.dart';
import '../../application/use_cases/list_source_profiles_use_case.dart';
import '../../application/use_cases/load_scan_policy_use_case.dart';
import '../../application/use_cases/load_scan_status_use_case.dart';
import '../../application/use_cases/load_source_binding_health_use_case.dart';
import '../../application/use_cases/load_source_binding_overview_use_case.dart';
import '../../application/use_cases/plan_interest_coverage_use_case.dart';
import '../../application/use_cases/request_scan_use_case.dart';
import '../../application/use_cases/set_scan_policy_use_case.dart';
import '../../domain/value_objects/source_interest_id.dart';
import '../../infrastructure/api_clients/generated_interest_coverage_plans_api_client.dart';
import '../../infrastructure/api_clients/generated_scan_policies_api_client.dart';
import '../../infrastructure/api_clients/generated_scan_runs_api_client.dart';
import '../../infrastructure/api_clients/generated_source_bindings_api_client.dart';
import '../../infrastructure/api_clients/generated_source_profiles_api_client.dart';
import '../../infrastructure/api_clients/in_memory_interest_coverage_plans_api_client.dart';
import '../../infrastructure/api_clients/in_memory_scan_policies_api_client.dart';
import '../../infrastructure/api_clients/in_memory_scan_runs_api_client.dart';
import '../../infrastructure/api_clients/in_memory_source_bindings_api_client.dart';
import '../../infrastructure/api_clients/in_memory_source_profiles_api_client.dart';
import '../../infrastructure/api_clients/interest_coverage_plans_api_client.dart';
import '../../infrastructure/api_clients/scan_policies_api_client.dart';
import '../../infrastructure/api_clients/scan_runs_api_client.dart';
import '../../infrastructure/api_clients/source_bindings_api_client.dart';
import '../../infrastructure/api_clients/source_profiles_api_client.dart';
import '../../infrastructure/repositories/generated_interest_coverage_plan_catalog.dart';
import '../../infrastructure/repositories/generated_scan_policy_catalog.dart';
import '../../infrastructure/repositories/generated_scan_run_catalog.dart';
import '../../infrastructure/repositories/generated_source_binding_catalog.dart';
import '../../infrastructure/repositories/generated_source_profile_catalog.dart';
import '../stores/interest_coverage_plan_store.dart';
import '../stores/scan_policy_store.dart';
import '../stores/scan_run_store.dart';
import '../stores/source_bindings_store.dart';
import '../stores/source_profiles_store.dart';
import 'sources_feature_demo_fixtures.dart';

enum SourcesFeatureWorkflow { sourceProfiles, sourceBindings }

final class SourcesFeatureModule extends Module {
  SourcesFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
  }) : workflow = SourcesFeatureWorkflow.sourceProfiles,
       sourceBindingInterestId = const SourceInterestId('interest-demo'),
       sourceBindingInterestTitle = 'Demo interest';

  SourcesFeatureModule.sourceProfilesDemo()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      workflow = SourcesFeatureWorkflow.sourceProfiles,
      sourceBindingInterestId = const SourceInterestId('interest-demo'),
      sourceBindingInterestTitle = 'Demo interest';

  SourcesFeatureModule.sourceBindings({
    required this.generatedApiRuntime,
    required this.scope,
    required this.sourceBindingInterestId,
    required this.sourceBindingInterestTitle,
  }) : workflow = SourcesFeatureWorkflow.sourceBindings;

  SourcesFeatureModule.sourceBindingsDemo({
    required this.sourceBindingInterestId,
    required this.sourceBindingInterestTitle,
  }) : generatedApiRuntime = null,
       scope = const WorkspaceScope(
         tenantId: 'tenant-demo',
         workspaceId: 'ws-demo',
       ),
       workflow = SourcesFeatureWorkflow.sourceBindings;

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final SourcesFeatureWorkflow workflow;
  final SourceInterestId sourceBindingInterestId;
  final String sourceBindingInterestTitle;

  bool get showSourceProfiles =>
      workflow == SourcesFeatureWorkflow.sourceProfiles;

  bool get showSourceBindings =>
      workflow == SourcesFeatureWorkflow.sourceBindings;

  Object get retentionKey {
    return switch (workflow) {
      SourcesFeatureWorkflow.sourceProfiles =>
        'source-profiles-${scope.tenantId}-${scope.workspaceId}',
      SourcesFeatureWorkflow.sourceBindings =>
        'source-bindings-${scope.tenantId}-${scope.workspaceId}-${sourceBindingInterestId.value}',
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
    i.registerLazySingleton<InterestCoveragePlansApiClient>(
      _createPlansApiClient,
    );
    i.registerLazySingleton<InterestCoveragePlanCatalog>(
      () => GeneratedInterestCoveragePlanCatalog(
        apiClient: i.get<InterestCoveragePlansApiClient>(),
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
        bindSourceToInterest: BindSourceToInterestUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        changeSourceBindingStatus: ChangeSourceBindingStatusUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        loadSourceBindingHealth: LoadSourceBindingHealthUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        loadSourceBindingOverview: LoadSourceBindingOverviewUseCase(
          i.get<SourceBindingCatalog>(),
        ),
        scope: scope,
        interestId: sourceBindingInterestId,
        interestTitle: sourceBindingInterestTitle,
      ),
    );
    i.registerLazySingleton(
      () => InterestCoveragePlanStore(
        planInterestCoverage: PlanInterestCoverageUseCase(
          i.get<InterestCoveragePlanCatalog>(),
        ),
        scope: scope,
        interestId: sourceBindingInterestId,
        interestTitle: sourceBindingInterestTitle,
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

  InterestCoveragePlansApiClient _createPlansApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedInterestCoveragePlansApiClient.fromRuntime(
        runtime: runtime,
      );
    }
    return const InMemoryInterestCoveragePlansApiClient(plan: sourceDemoPlan);
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
