import 'package:modularity_flutter/modularity_flutter.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

import '../../application/contracts/interest_catalog.dart';
import '../../application/use_cases/archive_interest_use_case.dart';
import '../../application/use_cases/create_interest_use_case.dart';
import '../../application/use_cases/list_interests_use_case.dart';
import '../../application/use_cases/update_interest_use_case.dart';
import '../../infrastructure/api/interest_summary_api_dto.dart';
import '../../infrastructure/api_clients/generated_interests_api_client.dart';
import '../../infrastructure/api_clients/in_memory_interests_api_client.dart';
import '../../infrastructure/repositories/generated_interest_catalog.dart';
import '../stores/interests_form_store.dart';
import '../stores/interests_list_store.dart';

final class InterestsFeatureModule extends Module {
  InterestsFeatureModule()
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      showLifecycleFilters = true,
      showEditArchiveActions = true,
      onOpenInterestSources = null;

  InterestsFeatureModule.demo({this.onOpenInterestSources})
    : generatedApiRuntime = null,
      scope = const WorkspaceScope(
        tenantId: 'tenant-demo',
        workspaceId: 'ws-demo',
      ),
      showLifecycleFilters = true,
      showEditArchiveActions = true;

  InterestsFeatureModule.generatedApi({
    required this.generatedApiRuntime,
    required this.scope,
    this.onOpenInterestSources,
  }) : showLifecycleFilters = true,
       showEditArchiveActions = true;

  final Object? generatedApiRuntime;
  final WorkspaceScope scope;
  final bool showLifecycleFilters;
  final bool showEditArchiveActions;
  final void Function(String interestId, String interestTitle)?
  onOpenInterestSources;

  Object get retentionKey {
    if (generatedApiRuntime == null) {
      return 'interests-demo';
    }
    return 'interests-${scope.tenantId}-${scope.workspaceId}';
  }

  @override
  void binds(Binder i) {
    i.registerSingleton<WorkspaceScope>(scope);
    i.registerLazySingleton<InterestsApiClient>(_createApiClient);
    i.registerLazySingleton<InterestCatalog>(
      () => GeneratedInterestCatalog(apiClient: i.get<InterestsApiClient>()),
    );
    i.registerLazySingleton(
      () => InterestsListStore(
        listInterests: ListInterestsUseCase(i.get<InterestCatalog>()),
        scope: scope,
      ),
    );
    i.registerLazySingleton(
      () => InterestsFormStore(
        createInterest: CreateInterestUseCase(i.get<InterestCatalog>()),
        updateInterest: UpdateInterestUseCase(i.get<InterestCatalog>()),
        archiveInterest: ArchiveInterestUseCase(i.get<InterestCatalog>()),
        scope: scope,
      ),
    );
  }

  InterestsApiClient _createApiClient() {
    final runtime = generatedApiRuntime;
    if (runtime != null) {
      return GeneratedInterestsApiClient.fromRuntime(runtime: runtime);
    }
    return InMemoryInterestsApiClient(items: _demoInterests);
  }
}

const _demoInterests = [
  InterestSummaryApiDto(
    id: 'interest-market-risk',
    name: 'Market risk',
    query: 'market risk OR volatility',
    status: 'active',
    weeklyMentionCount: 24,
  ),
  InterestSummaryApiDto(
    id: 'interest-pricing',
    name: 'Competitor pricing',
    query: 'pricing OR plan change',
    status: 'draft',
    weeklyMentionCount: 8,
  ),
  InterestSummaryApiDto(
    id: 'interest-brand',
    name: 'Brand safety',
    query: 'brand safety OR incident',
    status: 'active',
    weeklyMentionCount: 15,
  ),
];
