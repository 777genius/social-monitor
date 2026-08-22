import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../integration_test/support/reader_summary_board_interaction.dart';

void main() {
  testWidgets(
    'selects the outer board viewport when nested scrollables precede lazy items',
    (tester) async {
      tester.view.physicalSize = const Size(800, 600);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });

      await tester.pumpWidget(const _NestedReaderSummaryBoard());
      await tester.pumpAndSettle();

      final publishedSummaryScrollView = find.byKey(
        const PageStorageKey<String>('published-summary-scroll-view'),
      );
      final boardRoot = publishedSummaryScrollView.evaluate().single;
      final previousSelectorCandidates = find
          .descendant(
            of: publishedSummaryScrollView,
            matching: find.byType(Scrollable),
          )
          .evaluate()
          .where((element) {
            final axisDirection = (element.widget as Scrollable).axisDirection;
            return (axisDirection == AxisDirection.down ||
                    axisDirection == AxisDirection.up) &&
                _nearestScrollViewAncestor(element) == boardRoot;
          });
      expect(
        previousSelectorCandidates,
        hasLength(2),
        reason: 'The previous nearest-ScrollView rule includes both viewports',
      );

      final outerScrollable = publishedSummaryOuterScrollable();
      expect(outerScrollable, findsOneWidget);
      expect(find.byKey(const ValueKey('additional-story-19')), findsNothing);

      await tester.scrollUntilVisible(
        find.byKey(const ValueKey('additional-story-19')),
        300,
        scrollable: outerScrollable,
      );
      await tester.pumpAndSettle();

      expect(find.text('Additional story 19'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}

class _NestedReaderSummaryBoard extends StatelessWidget {
  const _NestedReaderSummaryBoard();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: CustomScrollView(
          key: const PageStorageKey<String>('published-summary-scroll-view'),
          slivers: [
            SliverToBoxAdapter(
              child: SizedBox(
                height: 100,
                child: SingleChildScrollView(
                  child: Column(
                    children: const [
                      SizedBox(height: 80, child: Text('Nested summary board')),
                      SizedBox(
                        height: 80,
                        child: Text('Nested board overflow'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            SliverList.builder(
              itemCount: 20,
              itemBuilder: (context, index) => SizedBox(
                key: ValueKey('additional-story-$index'),
                height: 180,
                child: Text('Additional story $index'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

Element? _nearestScrollViewAncestor(Element element) {
  Element? nearest;
  element.visitAncestorElements((ancestor) {
    if (ancestor.widget is ScrollView) {
      nearest = ancestor;
      return false;
    }
    return true;
  });
  return nearest;
}
