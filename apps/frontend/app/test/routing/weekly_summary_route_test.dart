import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/app/social_monitor_app.dart';
import 'package:social_monitor_app/src/composition/app_composition_root.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_app/src/routing/app_router.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  testWidgets('redirects the legacy weekly route to unified summaries', (
    tester,
  ) async {
    final composition = AppCompositionRoot.demo(
      initialLocation: AppRoutes.legacyWeeklySummary,
    );

    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(
      composition.router.routeInformationProvider.value.uri.path,
      AppRoutes.summaries,
    );
    expect(find.text('Week'), findsOneWidget);
  });

  testWidgets('redirects the legacy production route before rendering', (
    tester,
  ) async {
    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Test tenant',
      workspaceName: 'Test workspace',
      workspaceRole: 'owner',
      statusLabel: 'Active',
      scope: WorkspaceScope(
        tenantId: 'tenant-weekly-route',
        workspaceId: 'workspace-weekly-route',
      ),
    );
    final composition = AppCompositionRoot.production(
      runtime: AppShellRuntime.connected(
        workspace: workspace,
        generatedApiRuntime: Object(),
        capabilities: const FeatureFlagSet({
          'summaries': FeatureCapability(
            key: 'summaries',
            isEnabled: false,
            disabledReasonCode: 'backend_contract_missing',
          ),
        }),
      ),
      initialLocation: AppRoutes.legacyWeeklySummary,
    );

    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(
      composition.router.routeInformationProvider.value.uri.path,
      AppRoutes.summaries,
    );
    expect(find.text('Summaries data is not connected yet'), findsOneWidget);
  });
}
