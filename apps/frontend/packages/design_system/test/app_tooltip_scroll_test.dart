import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

const _hintText = 'Scroll through this hint';

enum _HintKind { plain, rich, iconButton, popupMenu }

void main() {
  for (final kind in _HintKind.values) {
    testWidgets('wheel scroll passes through a visible $kind tooltip', (
      tester,
    ) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);
      await tester.pumpWidget(_page(controller, _hint(kind)));
      final mouse = await _hoverHint(tester);
      final tooltip = find.text(_hintText);
      expect(tooltip, findsOneWidget);
      final position = tester.getCenter(tooltip);
      await mouse.moveTo(position);
      await tester.pump(const Duration(milliseconds: 200));
      expect(
        tooltip,
        findsOneWidget,
        reason: 'hovering the bubble keeps it open',
      );
      await tester.sendEventToBinding(
        PointerScrollEvent(
          position: position,
          scrollDelta: const Offset(0, 100),
        ),
      );
      await tester.pumpAndSettle();
      expect(controller.offset, greaterThan(0));
      await mouse.removePointer();
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets(
    'preserves text and icon-only accessible hints and button actions',
    (tester) async {
      final semantics = tester.ensureSemantics();
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: IconButton(
                tooltip: _hintText,
                onPressed: () {},
                icon: const Icon(Icons.info),
              ),
            ),
          ),
        );
        final native = tester
            .getSemantics(find.byType(IconButton))
            .getSemanticsData();
        expect(native.label.isNotEmpty || native.tooltip.isNotEmpty, isTrue);
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: MergeSemantics(
                child: AppTooltip(
                  message: _hintText,
                  child: IconButton(
                    onPressed: () {},
                    icon: const Icon(Icons.info),
                  ),
                ),
              ),
            ),
          ),
        );
        expect(
          tester.getSemantics(find.byType(IconButton)),
          isSemantics(
            label: native.label,
            tooltip: native.tooltip,
            isButton: true,
            hasTapAction: true,
          ),
        );
        await tester.pumpWidget(
          MaterialApp(home: Scaffold(body: _hint(_HintKind.plain))),
        );
        final nodes = tester.semantics
            .simulatedAccessibilityTraversal()
            .map((node) => node.getSemanticsData())
            .toList();
        expect(nodes.any((data) => data.tooltip == _hintText), isTrue);
        expect(nodes.any((data) => data.label == 'Hover target'), isTrue);
      } finally {
        semantics.dispose();
      }
    },
  );

  for (final pending in [false, true]) {
    testWidgets(
      'empty hint cancels overlay and pending show (pending: $pending)',
      (tester) async {
        var message = _hintText;
        late StateSetter rebuild;
        await tester.pumpWidget(
          MaterialApp(
            home: Scaffold(
              body: StatefulBuilder(
                builder: (_, setState) {
                  rebuild = setState;
                  return AppTooltip(
                    message: message,
                    waitDuration: Duration(milliseconds: pending ? 500 : 0),
                    child: const Text('Hover target'),
                  );
                },
              ),
            ),
          ),
        );
        final mouse = await _hoverHint(tester);
        if (!pending) expect(find.text(_hintText), findsOneWidget);
        rebuild(() => message = '');
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        expect(find.text(_hintText), findsNothing);
        rebuild(() => message = _hintText);
        await tester.pump();
        expect(find.text(_hintText), findsNothing);
        await mouse.removePointer();
        await tester.pumpWidget(const SizedBox.shrink());
      },
    );
  }

  testWidgets('keyboard focus reveals the hint and Escape dismisses it', (
    tester,
  ) async {
    final focus = FocusNode();
    addTearDown(focus.dispose);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: AppTooltip(
            message: _hintText,
            child: TextButton(
              focusNode: focus,
              onPressed: () {},
              child: const Text('Button'),
            ),
          ),
        ),
      ),
    );
    focus.requestFocus();
    await tester.pumpAndSettle();
    expect(find.text(_hintText), findsOneWidget);
    await tester.sendKeyEvent(LogicalKeyboardKey.escape);
    await tester.pump();
    expect(find.text(_hintText), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('long press reveals the default tooltip', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: _hint(_HintKind.plain))),
    );
    await tester.longPress(find.text('Hover target'));
    await tester.pump();
    expect(find.text(_hintText), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
    'manual trigger retains hover without stealing touch long press',
    (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: _hint(
              _HintKind.plain,
              triggerMode: TooltipTriggerMode.manual,
            ),
          ),
        ),
      );
      await tester.longPress(find.text('Hover target'));
      await tester.pump();
      expect(find.text(_hintText), findsNothing);
      final mouse = await _hoverHint(tester);
      expect(find.text(_hintText), findsOneWidget);
      await mouse.removePointer();
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );

  testWidgets('honors hover delay and above-target placement', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: Center(
            child: AppTooltip(
              message: _hintText,
              preferBelow: false,
              waitDuration: Duration(milliseconds: 500),
              child: Text('Hover target'),
            ),
          ),
        ),
      ),
    );
    final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
    await mouse.addPointer(
      location: tester.getCenter(find.text('Hover target')),
    );
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text(_hintText), findsNothing);
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump();
    expect(
      tester.getBottomLeft(find.text(_hintText)).dy,
      lessThan(tester.getTopLeft(find.text('Hover target')).dy),
    );
    await mouse.removePointer();
    await tester.pumpWidget(const SizedBox.shrink());
  });
}

Widget _hint(_HintKind kind, {TooltipTriggerMode? triggerMode}) => AppTooltip(
  message: kind == _HintKind.rich ? null : _hintText,
  richMessage: kind == _HintKind.rich ? const TextSpan(text: _hintText) : null,
  waitDuration: Duration.zero,
  triggerMode: triggerMode,
  child: switch (kind) {
    _HintKind.iconButton => IconButton(
      onPressed: () {},
      icon: const Text('Hover target'),
    ),
    _HintKind.popupMenu => PopupMenuButton<int>(
      tooltip: '',
      itemBuilder: (_) => const [
        PopupMenuItem(value: 1, child: Text('Action')),
      ],
      child: const Text('Hover target'),
    ),
    _ => const SizedBox(height: 50, child: Text('Hover target')),
  },
);

Widget _page(ScrollController controller, Widget child) => MaterialApp(
  home: Scaffold(
    body: ListView(
      controller: controller,
      children: [
        const SizedBox(height: 100),
        child,
        const SizedBox(height: 2000),
      ],
    ),
  ),
);

Future<TestGesture> _hoverHint(WidgetTester tester) async {
  final mouse = await tester.createGesture(kind: PointerDeviceKind.mouse);
  await mouse.addPointer(location: tester.getCenter(find.text('Hover target')));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
  return mouse;
}
