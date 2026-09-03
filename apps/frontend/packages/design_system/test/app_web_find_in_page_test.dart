import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';

void main() {
  testWidgets('enables browser-style find only on web', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: AppWebFindInPage(
          child: Scaffold(body: Text('Release notes Needle')),
        ),
      ),
    );

    expect(find.text('Release notes Needle'), findsOneWidget);

    await _sendFindShortcut(tester);
    await tester.pumpAndSettle();

    if (!kIsWeb) {
      expect(find.byType(TextField), findsNothing);
      return;
    }

    expect(find.byType(TextField), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'Needle');
    await tester.pump();

    expect(find.text('1/1'), findsOneWidget);
  });
}

Future<void> _sendFindShortcut(WidgetTester tester) async {
  final modifier =
      defaultTargetPlatform == TargetPlatform.macOS ||
          defaultTargetPlatform == TargetPlatform.iOS
      ? LogicalKeyboardKey.metaLeft
      : LogicalKeyboardKey.controlLeft;
  await tester.sendKeyDownEvent(modifier);
  await tester.sendKeyEvent(LogicalKeyboardKey.keyF);
  await tester.sendKeyUpEvent(modifier);
}
