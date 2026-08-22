part of 'reader_summary_brief_surface_test.dart';

void _registerInlineCitationSourceTest() {
  testWidgets('opens cited source menu from inline citation badges', (
    tester,
  ) async {
    const mapper = SummaryMapper();
    final openedUrls = <String>[];
    final summary = mapper.readerSummaryToDomain(
      readerSummaryApiDto(
        citations: [
          summaryCitationApiDto(
            id: 'bc-1',
            sourceLabel: 'Repository source [1]',
            rawSnippet: 'The cited repository source backs this claim.',
            providerKey: 'github-repo-radar',
            canonicalUrl: 'https://github.com/example/ai-coding-tools',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryBriefSurface(
              summary: summary,
              citationsById: {
                for (final citation in summary.citations) citation.id: citation,
              },
              isRefreshing: false,
              onOpenUrl: openedUrls.add,
            ),
          ),
        ),
      ),
    );

    expect(
      find.byKey(
        const ValueKey('reader-summary-url-action-citation-source-bc-1'),
      ),
      findsNothing,
    );

    await _hoverCitationChip(
      tester,
      const ValueKey('reader-summary-lede-citation-bc-1'),
    );

    final sourceItem = find.byKey(
      const ValueKey('reader-summary-url-action-citation-source-bc-1'),
    );
    expect(sourceItem, findsOneWidget);
    expect(
      find.descendant(of: sourceItem, matching: find.text('AI coding tools')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text('Repository source [1]'),
      ),
      findsNothing,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text('The cited repository source backs this claim.'),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: sourceItem,
        matching: find.text('https://github.com/example/ai-coding-tools'),
      ),
      findsNothing,
    );

    await tester.tap(sourceItem);
    await tester.pumpAndSettle();

    expect(openedUrls, ['https://github.com/example/ai-coding-tools']);
  });
}

Future<void> _hoverCitationChip(
  WidgetTester tester,
  ValueKey<String> key,
) async {
  final citationChip = find.byKey(key);
  expect(citationChip, findsOneWidget);

  final gesture = await tester.createGesture(kind: PointerDeviceKind.mouse);
  addTearDown(gesture.removePointer);
  await gesture.addPointer(location: Offset.zero);
  await tester.pump();
  await gesture.moveTo(tester.getCenter(citationChip));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}
