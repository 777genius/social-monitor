import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  testWidgets('renders the Social Monitor brand asset with and without label', (
    tester,
  ) async {
    Future<void> pumpLogo({required bool showLabel}) {
      return tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: AppShellBrandLogo(
              title: 'Social Monitor',
              showLabel: showLabel,
            ),
          ),
        ),
      );
    }

    await pumpLogo(showLabel: true);
    expect(find.byKey(const ValueKey('app-shell-brand-mark')), findsOneWidget);
    expect(_brandSemantics(), findsOneWidget);
    expect(find.text('Social Monitor'), findsOneWidget);

    await pumpLogo(showLabel: false);
    expect(find.byKey(const ValueKey('app-shell-brand-mark')), findsOneWidget);
    expect(_brandSemantics(), findsOneWidget);
    expect(find.text('Social Monitor'), findsNothing);
  });
}

Finder _brandSemantics() => find.byWidgetPredicate(
  (widget) =>
      widget is Semantics && widget.properties.label == 'Social Monitor',
);
