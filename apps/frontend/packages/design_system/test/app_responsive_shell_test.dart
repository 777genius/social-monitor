import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  testWidgets('uses drawer navigation on compact screens', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: OverflowBox(
          minWidth: 390,
          maxWidth: 390,
          minHeight: 780,
          maxHeight: 780,
          child: SizedBox(
            width: 390,
            height: 780,
            child: AppAdaptiveShell(
              title: 'Social Monitor',
              selectedPath: '/',
              destinations: const [
                AppShellDestination(
                  label: 'Overview',
                  path: '/',
                  icon: Icons.monitor_heart_outlined,
                ),
              ],
              onDestinationSelected: (_) {},
              child: const SizedBox(),
            ),
          ),
        ),
      ),
    );

    tester.state<ScaffoldState>(find.byType(Scaffold)).openDrawer();
    await tester.pumpAndSettle();

    expect(find.byType(Drawer), findsOneWidget);
    expect(find.text('Social Monitor'), findsWidgets);
  });

  testWidgets('uses persistent navigation on expanded screens', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: OverflowBox(
          minWidth: 1180,
          maxWidth: 1180,
          minHeight: 780,
          maxHeight: 780,
          child: SizedBox(
            width: 1180,
            height: 780,
            child: AppAdaptiveShell(
              title: 'Social Monitor',
              selectedPath: '/',
              destinations: const [
                AppShellDestination(
                  label: 'Overview',
                  path: '/',
                  icon: Icons.monitor_heart_outlined,
                ),
                AppShellDestination(
                  label: 'Feed',
                  path: '/feed',
                  icon: Icons.dynamic_feed_outlined,
                ),
              ],
              onDestinationSelected: (_) {},
              child: const SizedBox(),
            ),
          ),
        ),
      ),
    );

    expect(find.byType(Drawer), findsNothing);
    expect(find.text('Social Monitor'), findsOneWidget);
    expect(find.text('Overview'), findsOneWidget);
    expect(find.text('Feed'), findsOneWidget);
  });

  testWidgets('selects persistent destinations through stable keys', (
    tester,
  ) async {
    String? selectedPath;
    tester.view.physicalSize = const Size(1180, 780);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light(),
        home: AppAdaptiveShell(
          title: 'Social Monitor',
          selectedPath: '/',
          destinations: const [
            AppShellDestination(
              label: 'Overview',
              path: '/',
              icon: Icons.monitor_heart_outlined,
            ),
            AppShellDestination(
              label: 'Settings',
              path: '/settings',
              icon: Icons.tune_outlined,
            ),
          ],
          onDestinationSelected: (path) {
            selectedPath = path;
          },
          child: const SizedBox(),
        ),
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('app-shell-destination-settings')),
    );

    expect(selectedPath, '/settings');
  });
}
