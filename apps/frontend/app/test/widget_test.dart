import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_app/src/app/social_monitor_app.dart';
import 'package:social_monitor_app/src/composition/app_composition_root.dart';
import 'package:social_monitor_app/src/composition/app_runtime.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  testWidgets('renders web-first frontend shell', (tester) async {
    await tester.pumpWidget(
      SocialMonitorApp(composition: AppCompositionRoot.bootstrap()),
    );

    expect(find.text('Social Monitor'), findsWidgets);
    expect(find.text('Monitoring command center'), findsOneWidget);
    expect(find.text('Workspace required'), findsWidgets);
    expect(find.text('Topics'), findsWidgets);
    expect(find.text('Sources'), findsWidgets);
  });

  testWidgets('keeps normal runtime free of demo feature data', (tester) async {
    final composition = AppCompositionRoot.production();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));
    await tester.pumpAndSettle();

    expect(find.text('Runtime not configured'), findsWidgets);
    expect(find.text('Acme alerts'), findsNothing);

    composition.router.go('/auth');
    await tester.pumpAndSettle();

    expect(find.text('Auth runtime not configured'), findsOneWidget);
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
    expect(find.text('Workspace required'), findsWidgets);
  });

  testWidgets('renders safe unknown route state', (tester) async {
    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));

    composition.router.go('/missing-route');
    await tester.pumpAndSettle();

    expect(find.text('Route not found'), findsOneWidget);
  });

  testWidgets('navigates the MVP frontend critical path', (tester) async {
    final composition = AppCompositionRoot.demo();
    await tester.pumpWidget(SocialMonitorApp(composition: composition));

    composition.router.go('/topics');
    await tester.pumpAndSettle();
    expect(find.text('Market risk'), findsWidgets);

    composition.router.go('/sources');
    await tester.pumpAndSettle();
    expect(find.text('RSS feeds credential attention'), findsOneWidget);

    composition.router.go('/feed');
    await tester.pumpAndSettle();
    expect(find.text('Pricing concern on Reddit'), findsWidgets);

    composition.router.go('/summaries');
    await tester.pumpAndSettle();
    expect(find.text('Weekly risk briefing'), findsWidgets);

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
      '/topics',
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

    composition.router.go('/topics');
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

    expect(find.text('Theme'), findsOneWidget);
    expect(composition.themeModeController.themeMode, ThemeMode.system);

    await tester.tap(find.byKey(const ValueKey('app-theme-mode-dark')));
    await tester.pumpAndSettle();

    expect(composition.themeModeController.themeMode, ThemeMode.dark);
    expect(
      Theme.of(
        tester.element(find.text('Monitoring command center')),
      ).brightness,
      Brightness.dark,
    );

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

    expect(find.text('Acme alerts'), findsOneWidget);

    composition.router.go('/topics');
    await tester.pumpAndSettle();
    await _tapText(tester, 'Create topic');
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('topic-name-field')),
      240,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.enterText(
      find.byKey(const ValueKey('topic-name-field')),
      'Competitor watch',
    );
    await tester.enterText(
      find.byKey(const ValueKey('topic-keywords-field')),
      'pricing, launch',
    );
    await _tapText(tester, 'Save topic');
    expect(find.text('Competitor watch'), findsWidgets);

    composition.router.go('/sources');
    await tester.pumpAndSettle();
    await _tapText(tester, 'Reconnect');
    expect(find.text('Credential attention required'), findsNothing);
    await _tapText(tester, 'Connect source');
    expect(find.text('Web mentions'), findsWidgets);

    composition.router.go('/feed');
    await tester.pumpAndSettle();
    expect(find.text('Pricing concern on Reddit'), findsWidgets);
    await _tapText(tester, 'Mark reviewed');
    expect(find.text('Positive launch mention'), findsWidgets);

    composition.router.go('/summaries');
    await tester.pumpAndSettle();
    expect(find.text('Citation safety'), findsOneWidget);
    await _tapText(tester, 'Helpful');

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
