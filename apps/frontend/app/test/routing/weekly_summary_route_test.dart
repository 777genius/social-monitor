import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/app/social_monitor_app.dart';
import 'package:social_monitor_app/src/composition/app_composition_root.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_app/src/routing/app_router.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  testWidgets('registers the typed weekly summary route in app composition', (
    tester,
  ) async {
    final composition = AppCompositionRoot.demo(
      initialLocation: AppRoutes.weeklySummary,
    );

    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(
      composition.router.routeInformationProvider.value.uri.path,
      AppRoutes.weeklySummary,
    );
    expect(
      find.text('Weekly summary data is not connected yet'),
      findsOneWidget,
    );
  });

  testWidgets(
    'fails closed on the production route without a generated runtime',
    (tester) async {
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
        ),
        initialLocation: AppRoutes.weeklySummary,
      );

      await tester.pumpWidget(SocialMonitorApp(composition: composition));
      await tester.pumpAndSettle();

      expect(
        composition.router.routeInformationProvider.value.uri.path,
        AppRoutes.weeklySummary,
      );
      expect(
        find.text('Weekly summary data is not connected yet'),
        findsOneWidget,
      );
    },
  );
}
