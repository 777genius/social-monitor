import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

enum _Order { model, likes }

void main() {
  testWidgets('selects a segment by tap and reports only real changes', (
    tester,
  ) async {
    final changes = <_Order>[];
    await _pumpControl(tester, selected: _Order.model, onChanged: changes.add);

    await tester.tap(find.byKey(const ValueKey('segment-model')));
    await tester.pump();
    expect(changes, isEmpty, reason: 'the selected segment cannot re-fire');

    await tester.tap(find.byKey(const ValueKey('segment-likes')));
    await tester.pump();
    expect(changes, [_Order.likes]);
  });

  testWidgets('exposes a named group of mutually exclusive segments', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pumpControl(tester, selected: _Order.likes, onChanged: (_) {});

    expect(find.bySemanticsLabel('Posts order'), findsOneWidget);
    expect(
      tester.getSemantics(find.bySemanticsLabel('Sort by likes')),
      isSemantics(
        label: 'Sort by likes',
        tooltip: 'Most liked first',
        isButton: true,
        isSelected: true,
        hasSelectedState: true,
        isInMutuallyExclusiveGroup: true,
        isEnabled: true,
        isFocusable: true,
        hasTapAction: true,
      ),
    );
    expect(
      tester.getSemantics(find.bySemanticsLabel('Sort by model rank')),
      isSemantics(isSelected: false, isInMutuallyExclusiveGroup: true),
    );
    semantics.dispose();
  });

  testWidgets('keyboard focus moves between segments and Space selects', (
    tester,
  ) async {
    final changes = <_Order>[];
    await _pumpControl(tester, selected: _Order.model, onChanged: changes.add);

    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.sendKeyEvent(LogicalKeyboardKey.tab);
    await tester.pump();
    await tester.sendKeyEvent(LogicalKeyboardKey.space);
    await tester.pump();

    expect(changes, [_Order.likes]);
  });

  testWidgets('a null callback disables every segment', (tester) async {
    final semantics = tester.ensureSemantics();
    await _pumpControl(tester, selected: _Order.model, onChanged: null);

    expect(
      tester.getSemantics(find.bySemanticsLabel('Sort by likes')),
      isSemantics(isEnabled: false, hasEnabledState: true),
    );
    await tester.tap(
      find.byKey(const ValueKey('segment-likes')),
      warnIfMissed: false,
    );
    await tester.pump();
    semantics.dispose();
  });

  testWidgets('keeps the 36 px toolbar height in light and dark themes', (
    tester,
  ) async {
    for (final theme in [AppTheme.light(), AppTheme.dark()]) {
      await _pumpControl(
        tester,
        selected: _Order.model,
        onChanged: (_) {},
        theme: theme,
      );
      expect(tester.getSize(find.byType(SegmentedButton<_Order>)).height, 36);
      expect(tester.takeException(), isNull);
    }
  });

  testWidgets('grows with large text without overflow', (tester) async {
    await _pumpControl(
      tester,
      selected: _Order.model,
      onChanged: (_) {},
      textScaler: const TextScaler.linear(2),
    );

    expect(tester.takeException(), isNull);
    expect(find.text('By likes'), findsOneWidget);
  });

  testWidgets('expanded fills a bounded compact width', (tester) async {
    await _pumpControl(
      tester,
      selected: _Order.model,
      onChanged: (_) {},
      width: 320,
      expanded: true,
    );

    expect(tester.getSize(find.byType(SegmentedButton<_Order>)).width, 320);
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpControl(
  WidgetTester tester, {
  required _Order selected,
  required ValueChanged<_Order>? onChanged,
  ThemeData? theme,
  TextScaler textScaler = TextScaler.noScaling,
  double? width,
  bool expanded = false,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: theme ?? AppTheme.light(),
      home: MediaQuery(
        data: MediaQueryData(
          size: const Size(800, 400),
          textScaler: textScaler,
        ),
        child: Scaffold(
          body: Center(
            child: SizedBox(
              width: width,
              child: AppSegmentedControl<_Order>(
                semanticLabel: 'Posts order',
                selected: selected,
                onChanged: onChanged,
                expanded: expanded,
                segments: const [
                  AppSegment(
                    value: _Order.model,
                    label: 'By model',
                    icon: Icons.auto_awesome_outlined,
                    tooltip: 'Model order',
                    semanticLabel: 'Sort by model rank',
                    key: ValueKey('segment-model'),
                  ),
                  AppSegment(
                    value: _Order.likes,
                    label: 'By likes',
                    icon: Icons.favorite_border_rounded,
                    tooltip: 'Most liked first',
                    semanticLabel: 'Sort by likes',
                    key: ValueKey('segment-likes'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
}
