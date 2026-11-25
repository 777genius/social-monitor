import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/app/social_monitor_app.dart';
import 'package:social_monitor_app/src/composition/app_composition_root.dart';
import 'package:social_monitor_app/src/composition/app_frontend_runtime_config.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_app/src/composition/app_theme_mode_controller.dart';
import 'package:social_monitor_app/src/routing/app_shell_page.dart';
import 'package:social_monitor_app/src/routing/guest_community_destinations.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';

void main() {
  test('production config starts proxy auth session discovery', () {
    final runtime = const AppFrontendRuntimeConfig(
      apiBaseUrl: 'http://localhost:3000',
      correlationId: 'test-correlation',
    ).createRuntimeOrNull();

    expect(runtime, isNotNull);
    expect(runtime?.session.isRestoring, isTrue);
    expect(runtime?.workspace.isAvailable, isFalse);
    expect(runtime?.generatedApiRuntime, isNotNull);
  });

  test(
    'production config can start connected workspace runtime without bearer',
    () {
      final runtime = const AppFrontendRuntimeConfig(
        apiBaseUrl: 'http://localhost:3000',
        correlationId: 'test-correlation',
        tenantId: 'tenant-1',
        workspaceId: 'workspace-1',
        tenantName: 'Acme',
        workspaceName: 'Acme alerts',
        workspaceRole: 'Owner',
        userId: 'user-1',
        userLabel: 'Operator',
      ).createRuntimeOrNull();

      expect(runtime, isNotNull);
      expect(runtime?.session.isRestoring, isFalse);
      expect(runtime?.session.userId, 'user-1');
      expect(runtime?.session.userRole, 'admin');
      expect(runtime?.workspace.scope?.tenantId, 'tenant-1');
      expect(runtime?.workspace.scope?.workspaceId, 'workspace-1');
      expect(runtime?.capabilities.capability('summaries').isEnabled, isTrue);
      expect(runtime?.generatedApiRuntime, isNotNull);
    },
  );

  test('runtime controller applies restored auth session and capabilities', () {
    final controller = AppRuntimeController(
      AppShellRuntime.restoring(generatedApiRuntime: Object()),
    );
    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Acme',
      workspaceName: 'Acme alerts',
      workspaceRole: 'admin',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );

    controller.restoreAuthSession(
      userId: 'user-1',
      userLabel: 'Operator',
      userRole: 'admin',
      selectedWorkspace: workspace,
      availableWorkspaces: const [workspace],
    );

    expect(controller.runtime.session.userId, 'user-1');
    expect(controller.runtime.session.userRole, 'admin');
    expect(controller.runtime.session.isRestoring, isFalse);
    expect(controller.runtime.workspace.scope, workspace.scope);
    expect(
      controller.runtime.capabilities.capability('interests').isEnabled,
      isTrue,
    );
  });

  test('viewer session keeps only public summaries enabled', () {
    final controller = AppRuntimeController(
      AppShellRuntime.restoring(generatedApiRuntime: Object()),
    );
    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Public',
      workspaceName: 'Daily stories',
      workspaceRole: 'viewer',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );

    controller.restoreAuthSession(
      userId: 'guest-1',
      userLabel: 'Guest',
      userRole: 'user',
      selectedWorkspace: workspace,
      availableWorkspaces: const [workspace],
    );

    expect(controller.runtime.isGuest, isTrue);
    expect(
      controller.runtime.capabilities.capability('summaries').isEnabled,
      isTrue,
    );
    expect(
      controller.runtime.capabilities.capability('feed').isEnabled,
      isFalse,
    );
    expect(
      controller.runtime.capabilities.capability('settings').isEnabled,
      isFalse,
    );
  });

  testWidgets('shows community links as guest navigation destinations', (
    tester,
  ) async {
    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Public',
      workspaceName: 'Daily stories',
      workspaceRole: 'viewer',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );
    final runtimeController = AppRuntimeController(
      AppShellRuntime.connected(
        workspace: workspace,
        generatedApiRuntime: Object(),
        session: const AppSessionSnapshot(
          isSignedIn: true,
          isRestoring: false,
          userId: 'guest-1',
          userLabel: 'Guest',
          userRole: 'user',
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: AppShellPage(
          features: const [],
          runtimeController: runtimeController,
          themeModeController: AppThemeModeController(),
          location: '/summaries',
          child: const SizedBox(),
        ),
      ),
    );

    expect(find.text('GitHub'), findsOneWidget);
    expect(find.text('Discord'), findsOneWidget);

    const adminWorkspace = AppWorkspaceSnapshot(
      tenantName: 'Private',
      workspaceName: 'Admin workspace',
      workspaceRole: 'admin',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );
    runtimeController.restoreAuthSession(
      userId: 'admin-1',
      userLabel: 'Admin',
      userRole: 'admin',
      selectedWorkspace: adminWorkspace,
      availableWorkspaces: const [adminWorkspace],
    );
    await tester.pump();

    expect(find.text('GitHub'), findsNothing);
    expect(find.text('Discord'), findsNothing);
  });

  test('guest community destinations use the public project URLs', () {
    expect(guestCommunityDestinations.map((destination) => destination.path), [
      'https://github.com/777genius/social-monitor',
      'https://discord.gg/MWmrv57Qkt',
    ]);
  });

  test('feature descriptors reflect restored runtime status', () {
    final composition = AppCompositionRoot.production(
      runtime: AppShellRuntime.restoring(generatedApiRuntime: Object()),
    );
    final auth = composition.features.firstWhere(
      (feature) => feature.id == 'auth',
    );
    final interests = composition.features.firstWhere(
      (feature) => feature.id == 'interests',
    );
    final settings = composition.features.firstWhere(
      (feature) => feature.id == 'settings',
    );

    expect(auth.status, 'Runtime not configured');
    expect(interests.status, 'Workspace required');
    expect(settings.status, 'Workspace required');

    const workspace = AppWorkspaceSnapshot(
      tenantName: 'Acme',
      workspaceName: 'Acme alerts',
      workspaceRole: 'admin',
      statusLabel: 'Active',
      scope: WorkspaceScope(tenantId: 'tenant-1', workspaceId: 'workspace-1'),
    );

    composition.runtimeController.restoreAuthSession(
      userId: 'user-1',
      userLabel: 'Operator',
      userRole: 'admin',
      selectedWorkspace: workspace,
      availableWorkspaces: const [workspace],
    );

    expect(auth.status, 'Runtime');
    expect(interests.status, 'API');
    expect(settings.status, 'Runtime');
  });

  testWidgets('renders web-first frontend shell', (tester) async {
    await tester.pumpWidget(
      SocialMonitorApp(composition: AppCompositionRoot.bootstrap()),
    );

    expect(find.text('Social Monitor'), findsWidgets);
    expect(find.byType(SelectionArea), findsOneWidget);
    expect(find.text('Monitoring command center'), findsOneWidget);
    expect(find.text('Workspace required'), findsWidgets);
    expect(find.text('Interests'), findsWidgets);
    expect(find.text('Sources'), findsWidgets);
  });

  testWidgets('keeps normal runtime free of demo feature data', (tester) async {
    final composition = AppCompositionRoot.production();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('Workspace required'), findsWidgets);
    expect(find.text('Acme alerts'), findsNothing);

    composition.router.go('/auth');
    await tester.pumpAndSettle();

    expect(find.text('Session restore failed'), findsOneWidget);
    expect(
      find.text('Runtime session is not configured with workspace access'),
      findsOneWidget,
    );
  });

  testWidgets('redirects signed out users to auth route', (tester) async {
    await tester.pumpWidget(
      SocialMonitorApp(
        composition: AppCompositionRoot.demo(
          runtime: AppShellRuntime.signedOut(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Auth and workspace session'), findsOneWidget);
    expect(find.text('Workspace required'), findsNothing);
  });

  testWidgets('renders safe unknown route state', (tester) async {
    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));

    composition.router.go('/missing-route');
    await tester.pumpAndSettle();

    expect(find.text('Route not found'), findsOneWidget);
  });

  testWidgets('preserves a public summary deep link while restoring', (
    tester,
  ) async {
    const deepLink = '/summaries/reader-summary-1';
    final composition = AppCompositionRoot.demo(
      runtime: AppShellRuntime.restoring(generatedApiRuntime: Object()),
      initialLocation: deepLink,
    );

    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pump();

    expect(
      composition.router.routeInformationProvider.value.uri.path,
      deepLink,
    );
    expect(find.byKey(const ValueKey('app-session-restoring')), findsOneWidget);
    expect(find.text('Runtime unavailable'), findsNothing);

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
      deepLink,
    );
    expect(find.text('Runtime unavailable'), findsNothing);
  });

  testWidgets('honors configured initial route for visual e2e', (tester) async {
    final composition = AppCompositionRoot.demo(initialLocation: '/summaries');
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('No workspace summary'), findsWidgets);
    expect(find.text('Monitoring command center'), findsNothing);
  });

  testWidgets('honors interest sources initial route for visual e2e', (
    tester,
  ) async {
    final composition = AppCompositionRoot.demo(
      initialLocation:
          '/sources?interestId=interest-market-risk&interestTitle=Market%20risk',
    );
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('Sources for Market risk'), findsOneWidget);
    expect(find.text('Recommended sources'), findsOneWidget);
    expect(find.text('For Market risk'), findsOneWidget);
    expect(find.text('Loading sources'), findsNothing);
  });

  testWidgets('navigates the MVP frontend critical path', (tester) async {
    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));

    composition.router.go('/interests');
    await tester.pumpAndSettle();
    expect(find.text('Market risk'), findsWidgets);

    composition.router.go('/sources');
    await tester.pumpAndSettle();
    expect(find.text('Source profiles'), findsOneWidget);
    expect(find.text('Reddit'), findsWidgets);

    composition.router.go('/feed');
    await tester.pumpAndSettle();
    expect(find.text('Feed'), findsWidgets);
    expect(find.text('Search posts'), findsOneWidget);

    composition.router.go('/summaries');
    await tester.pumpAndSettle();
    expect(find.text('No workspace summary'), findsWidgets);

    composition.router.go('/settings');
    await tester.pumpAndSettle();
    expect(find.text('Support-safe diagnostics'), findsOneWidget);
  });

  testWidgets('renders MVP route set on a medium viewport', (tester) async {
    tester.view.physicalSize = const Size(834, 1112);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    for (final route in const [
      '/interests',
      '/sources',
      '/feed',
      '/summaries',
      '/settings',
    ]) {
      composition.router.go(route);
      await tester.pumpAndSettle();
      expect(find.text('Social Monitor'), findsWidgets);
    }
  });

  testWidgets('switches shell routes without overlapping page content', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('Monitoring command center'), findsOneWidget);

    composition.router.go('/interests');
    await tester.pump();

    expect(find.text('Monitoring command center'), findsNothing);

    await tester.pumpAndSettle();

    expect(find.text('Monitoring command center'), findsNothing);
    expect(find.text('Market risk'), findsWidgets);
  });

  testWidgets('exposes and applies the app theme switcher', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('app-theme-mode-menu')), findsOneWidget);
    expect(find.text('System'), findsOneWidget);
    expect(composition.themeModeController.themeMode, ThemeMode.system);

    await tester.tap(find.byKey(const ValueKey('app-theme-mode-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('app-theme-mode-dark')));
    await tester.pumpAndSettle();

    expect(composition.themeModeController.themeMode, ThemeMode.dark);
    expect(
      Theme.of(
        tester.element(find.text('Monitoring command center')),
      ).brightness,
      Brightness.dark,
    );

    await tester.tap(find.byKey(const ValueKey('app-theme-mode-menu')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('app-theme-mode-light')));
    await tester.pumpAndSettle();

    expect(composition.themeModeController.themeMode, ThemeMode.light);
    expect(
      Theme.of(
        tester.element(find.text('Monitoring command center')),
      ).brightness,
      Brightness.light,
    );
  });

  testWidgets('completes the MVP acceptance workflow', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('Monitoring command center'), findsOneWidget);

    composition.router.go('/interests');
    await tester.pumpAndSettle();
    await _tapText(tester, 'Create interest');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('interest-name-field')),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const ValueKey('interest-name-field')),
      'Competitor watch',
    );
    await tester.enterText(
      find.byKey(const ValueKey('interest-query-field')),
      'pricing OR launch',
    );
    await _tapText(tester, 'Save interest');
    expect(find.text('Competitor watch'), findsWidgets);

    composition.router.go('/sources');
    await tester.pumpAndSettle();
    expect(find.text('Source profiles'), findsOneWidget);
    expect(find.text('GitHub'), findsWidgets);

    composition.router.go('/interests');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Market risk').first);
    await tester.pumpAndSettle();
    await _tapText(tester, 'Sources');
    expect(find.text('Interest sources'), findsWidgets);
    expect(find.text('Reddit - Listing'), findsWidgets);
    expect(find.text('Uses platform Reddit app credential'), findsOneWidget);
    expect(find.text('Scan policy'), findsOneWidget);
    expect(find.text('Start scan'), findsOneWidget);
    await _tapText(tester, 'Start scan');
    expect(find.text('Scan request failed'), findsNothing);

    composition.router.go('/feed');
    await tester.pumpAndSettle();
    expect(find.text('Feed'), findsWidgets);
    expect(find.text('Search posts'), findsOneWidget);

    composition.router.go('/summaries');
    await tester.pumpAndSettle();
    expect(find.text('No workspace summary'), findsWidgets);
    expect(
      find.text('Run a workspace summary after feed items are collected.'),
      findsWidgets,
    );

    composition.router.go('/settings');
    await tester.pumpAndSettle();
    await _tapText(tester, 'Daily');
    expect(find.text('Daily'), findsWidgets);
    await _tapText(tester, 'Copy diagnostics');
    expect(find.text('Diagnostics ready to copy'), findsOneWidget);
  });
}

Future<void> _tapText(WidgetTester tester, String text) async {
  final buttonFinder = find.byWidgetPredicate(
    (widget) => widget is AppButton && widget.label == text,
    description: 'AppButton with label "$text"',
  );
  final tapTarget = find.descendant(
    of: buttonFinder.first,
    matching: find.byWidgetPredicate(
      (widget) => widget.runtimeType.toString() == 'RTextButton',
      description: 'headless text button for "$text"',
    ),
  );
  await tester.ensureVisible(tapTarget);
  await tester.tap(tapTarget.first, warnIfMissed: false);
  await tester.pumpAndSettle();
}
