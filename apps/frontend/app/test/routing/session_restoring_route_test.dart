import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/app/social_monitor_app.dart';
import 'package:social_monitor_app/src/composition/app_composition_root.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  testWidgets('restoring guest session never renders dashboard warnings', (
    tester,
  ) async {
    final composition = AppCompositionRoot.demo(
      runtime: AppShellRuntime.restoring(generatedApiRuntime: Object()),
    );

    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pump();

    expect(find.byKey(const ValueKey('app-session-restoring')), findsOneWidget);
    expect(find.text('Workspace required'), findsNothing);
    expect(find.text('Runtime unavailable'), findsNothing);
    expect(find.text('Monitoring command center'), findsNothing);

    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Public',
      workspaceName: 'Daily stories',
      workspaceRole: 'viewer',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );
    composition.runtimeController.restoreAuthSession(
      userId: 'guest-1',
      userLabel: 'Guest',
      userRole: 'user',
      selectedWorkspace: workspace,
      availableWorkspaces: const [workspace],
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('app-session-restoring')), findsNothing);
    expect(
      composition.router.routeInformationProvider.value.uri.path,
      '/summaries',
    );
  });
}
