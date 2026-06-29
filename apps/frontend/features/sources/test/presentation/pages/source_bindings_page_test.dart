import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_sources/src/application/use_cases/bind_source_to_interest_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/change_source_binding_status_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/list_source_bindings_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_scan_policy_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_scan_status_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/load_source_binding_health_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/plan_interest_coverage_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/request_scan_use_case.dart';
import 'package:social_monitor_sources/src/application/use_cases/set_scan_policy_use_case.dart';
import 'package:social_monitor_sources/src/domain/value_objects/source_interest_id.dart';
import 'package:social_monitor_sources/src/infrastructure/api/source_binding_api_dto.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_interest_coverage_plans_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_scan_policies_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_scan_runs_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/api_clients/in_memory_source_bindings_api_client.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_interest_coverage_plan_catalog.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_scan_policy_catalog.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_scan_run_catalog.dart';
import 'package:social_monitor_sources/src/infrastructure/repositories/generated_source_binding_catalog.dart';
import 'package:social_monitor_sources/src/presentation/pages/source_bindings_page.dart';
import 'package:social_monitor_sources/src/presentation/stores/interest_coverage_plan_store.dart';
import 'package:social_monitor_sources/src/presentation/stores/scan_policy_store.dart';
import 'package:social_monitor_sources/src/presentation/stores/scan_run_store.dart';
import 'package:social_monitor_sources/src/presentation/stores/source_bindings_store.dart';

import '../../support/sources_test_fixtures.dart';

void main() {
  testWidgets('renders binding detail and bind source form', (tester) async {
    final store = _store([sourceBindingApiDto()]);
    final interestCoveragePlanStore = _interestCoveragePlanStore();
    final policyStore = _policyStore();
    final scanRunStore = _scanRunStore();

    await tester.pumpWidget(
      _TestApp(
        store: store,
        interestCoveragePlanStore: interestCoveragePlanStore,
        policyStore: policyStore,
        scanRunStore: scanRunStore,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Interest sources'), findsOneWidget);
    expect(find.text('Sources for Competitor launches'), findsOneWidget);
    expect(find.text('Recommended sources'), findsOneWidget);
    expect(find.text('For Competitor launches'), findsOneWidget);
    expect(find.text('Confidence 8/10'), findsOneWidget);
    expect(find.text('Reddit - Listing'), findsWidgets);
    expect(find.text('Uses platform Reddit app credential'), findsOneWidget);
    expect(find.text('Health summary'), findsOneWidget);
    expect(find.text('Scan policy'), findsOneWidget);
    expect(find.text('Save policy'), findsOneWidget);
    expect(find.text('Scan run'), findsOneWidget);
    expect(find.text('Start scan'), findsOneWidget);

    await tester.tap(
      find.byKey(const ValueKey('app-button-Bind manually-primary-true')).first,
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('source-binding-provider-field')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('source-binding-query-field')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('source-binding-submit-button-false')),
      findsOneWidget,
    );
  });
}

SourceBindingsStore _store(List<SourceBindingApiDto> items) {
  final catalog = GeneratedSourceBindingCatalog(
    apiClient: InMemorySourceBindingsApiClient(items: items),
  );
  return SourceBindingsStore(
    listSourceBindings: ListSourceBindingsUseCase(catalog),
    bindSourceToInterest: BindSourceToInterestUseCase(catalog),
    changeSourceBindingStatus: ChangeSourceBindingStatusUseCase(catalog),
    loadSourceBindingHealth: LoadSourceBindingHealthUseCase(catalog),
    scope: sourceWorkspaceScope,
    interestId: const SourceInterestId('interest-competitor'),
    interestTitle: 'Competitor launches',
  );
}

ScanPolicyStore _policyStore() {
  final catalog = GeneratedScanPolicyCatalog(
    apiClient: InMemoryScanPoliciesApiClient(items: [scanPolicyApiDto()]),
  );
  return ScanPolicyStore(
    loadScanPolicy: LoadScanPolicyUseCase(catalog),
    setScanPolicy: SetScanPolicyUseCase(catalog),
    scope: sourceWorkspaceScope,
  );
}

InterestCoveragePlanStore _interestCoveragePlanStore() {
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

ScanRunStore _scanRunStore() {
  final catalog = GeneratedScanRunCatalog(
    apiClient: InMemoryScanRunsApiClient(statuses: [scanStatusApiDto()]),
  );
  return ScanRunStore(
    requestScan: RequestScanUseCase(catalog),
    loadScanStatus: LoadScanStatusUseCase(catalog),
    scope: sourceWorkspaceScope,
    autoPolling: false,
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.store,
    required this.interestCoveragePlanStore,
    required this.policyStore,
    required this.scanRunStore,
  });

  final SourceBindingsStore store;
  final InterestCoveragePlanStore interestCoveragePlanStore;
  final ScanPolicyStore policyStore;
  final ScanRunStore scanRunStore;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SourceBindingsPage(
            store: store,
            interestCoveragePlanStore: interestCoveragePlanStore,
            policyStore: policyStore,
            scanRunStore: scanRunStore,
          ),
        ),
      ),
    );
  }
}
