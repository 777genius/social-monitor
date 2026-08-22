import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RendererBinding;
import 'package:flutter_test/flutter_test.dart';

import 'reader_summary_scenario_data.dart';

const _readerSummaryUrlActionKeyPrefix = 'reader-summary-url-action-';
const _excludedRedditUrlIdentity = '0c6dd069';

Finder publishedSummaryOuterScrollable() {
  final scrollView = find.byKey(
    const PageStorageKey<String>('published-summary-scroll-view'),
  );
  expect(scrollView, findsOneWidget);
  final scrollViewElement = scrollView.evaluate().single;
  final candidates = find
      .descendant(of: scrollView, matching: find.byType(Scrollable))
      .evaluate()
      .where(
        (element) =>
            _isVerticalScrollable(element.widget) &&
            !_hasInterveningScrollable(element, scrollViewElement),
      )
      .toList(growable: false);
  expect(
    candidates,
    hasLength(1),
    reason:
        'The published summary must own exactly one outer vertical viewport',
  );
  final outerScrollable = candidates.single;
  return find.byElementPredicate(
    (element) => element == outerScrollable,
    skipOffstage: false,
  );
}

bool _isVerticalScrollable(Widget widget) =>
    widget is Scrollable &&
    (widget.axisDirection == AxisDirection.down ||
        widget.axisDirection == AxisDirection.up);

bool _hasInterveningScrollable(Element element, Element boardRoot) {
  var hasInterveningScrollable = false;
  element.visitAncestorElements((ancestor) {
    if (ancestor == boardRoot) return false;
    if (ancestor.widget is Scrollable) {
      hasInterveningScrollable = true;
      return false;
    }
    return true;
  });
  return hasInterveningScrollable;
}

Future<void> pumpUntilReaderSummaryReady(
  WidgetTester tester,
  Finder finder,
) async {
  for (var attempt = 0; attempt < 200; attempt++) {
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 50)),
    );
    await tester.pump();
    if (finder.evaluate().isNotEmpty) return;
  }
  fail('Production published summary route did not become ready');
}

void expectRejectedReaderSummaryContentAbsent() {
  final renderedText = _renderedText();
  final semanticsText = _renderedSemantics();
  for (final title in rejectedTitles) {
    expect(renderedText, isNot(contains(title)));
    expect(semanticsText, isNot(contains(title)));
    expect(find.bySemanticsLabel(title), findsNothing);
  }
  expect(renderedText, isNot(contains(excludedRedditUrl)));
  expect(semanticsText, isNot(contains(excludedRedditUrl)));
  expect(semanticsText, isNot(contains(_excludedRedditUrlIdentity)));
  expect(
    find.byWidgetPredicate((widget) {
      final key = widget.key?.toString() ?? '';
      return key.contains(excludedRedditUrl) ||
          key.contains(_excludedRedditUrlIdentity) ||
          key.contains('reddit-zero-nineteen');
    }),
    findsNothing,
  );
}

void _expectExactRenderedOccurrence(String title) {
  expect(_occurrences(_renderedText(), title), 1);
  expect(_occurrences(_renderedSemantics(), title), 1);
}

String _renderedText() => find
    .byType(Text)
    .evaluate()
    .map((element) => element.widget as Text)
    .map((widget) => widget.data ?? widget.textSpan?.toPlainText() ?? '')
    .join('\n');

String _renderedSemantics() => RendererBinding.instance.renderViews
    .map(
      (view) =>
          view.owner?.semanticsOwner?.rootSemanticsNode?.toStringDeep() ?? '',
    )
    .join('\n');

int _occurrences(String value, String needle) =>
    needle.allMatches(value).length;

Finder readerSummaryList() {
  final firstRow = find.ancestor(
    of: find.text(topTitles.first),
    matching: find.byWidgetPredicate(
      (widget) => _stringKey(widget).startsWith(_summaryRowKeyPrefix),
    ),
  );
  expect(firstRow, findsOneWidget);
  final state = Scrollable.of(firstRow.evaluate().single);
  final element = state.context as Element;
  return find.byElementPredicate(
    (candidate) => candidate == element,
    skipOffstage: false,
  );
}

Future<Finder> _scrollSummaryListToRow(
  WidgetTester tester,
  Finder summaryList,
  String title,
) async {
  final titleFinder = find.descendant(
    of: summaryList,
    matching: find.text(title),
  );
  await _scrollSummaryListUntilVisible(tester, summaryList, titleFinder);
  final row = find.ancestor(
    of: titleFinder,
    matching: find.byWidgetPredicate(
      (widget) => _stringKey(widget).startsWith(_summaryRowKeyPrefix),
    ),
  );
  expect(row, findsOneWidget, reason: 'Missing summary row for "$title"');
  return row;
}

Future<void> _scrollSummaryListUntilVisible(
  WidgetTester tester,
  Finder summaryList,
  Finder target,
) async {
  final position = tester.state<ScrollableState>(summaryList).position;
  for (var attempt = 0; attempt < 50 && target.evaluate().isEmpty; attempt++) {
    final next = (position.pixels + 240)
        .clamp(position.minScrollExtent, position.maxScrollExtent)
        .toDouble();
    if (next == position.pixels) break;
    position.jumpTo(next);
    await tester.pump();
  }
  expect(target, findsOneWidget);
  final renderObject = target.evaluate().single.findRenderObject();
  expect(renderObject, isNotNull);
  await position.ensureVisible(renderObject!, alignment: 0.5);
  await tester.pumpAndSettle();
}

Future<void> _resetSummaryList(WidgetTester tester, Finder summaryList) async {
  tester.state<ScrollableState>(summaryList).position.jumpTo(0);
  await tester.pumpAndSettle();
}

Future<void> exerciseReaderSummaryBoard(
  WidgetTester tester,
  Finder summaryList, {
  required List<String> titles,
  required List<String> primaryUrls,
  required List<Set<String>> authorizedUrlsByPost,
  required List<String> openedUrls,
  Set<String> exactTitles = const {},
}) async {
  expect(titles, hasLength(primaryUrls.length));
  expect(authorizedUrlsByPost, hasLength(primaryUrls.length));
  await _resetSummaryList(tester, summaryList);
  final activationStart = openedUrls.length;
  final primaryEmitted = <String>[];
  for (var index = 0; index < titles.length; index++) {
    final row = await _scrollSummaryListToRow(
      tester,
      summaryList,
      titles[index],
    );
    expectRejectedReaderSummaryContentAbsent();
    if (exactTitles.contains(titles[index])) {
      _expectExactRenderedOccurrence(titles[index]);
    }
    final primaryTarget = find.descendant(
      of: row,
      matching: find.byWidgetPredicate(
        (widget) =>
            widget is InkWell &&
            _stringKey(
              widget,
            ).startsWith('${_readerSummaryUrlActionKeyPrefix}post-card-'),
      ),
    );
    await _scrollSummaryListUntilVisible(tester, summaryList, primaryTarget);
    final beforePrimary = openedUrls.length;
    await tester.tap(primaryTarget);
    await tester.pump();
    expect(openedUrls, hasLength(beforePrimary + 1));
    expect(openedUrls.last, primaryUrls[index]);
    primaryEmitted.add(openedUrls.last);
    await _activateAuthorizedRowUrls(
      tester,
      summaryList,
      row,
      index,
      primaryUrls[index],
      authorizedUrlsByPost[index],
      openedUrls,
    );
  }
  expect(primaryEmitted, primaryUrls);
  final allowed = authorizedUrlsByPost.expand((urls) => urls).toSet();
  final emitted = openedUrls.skip(activationStart);
  expect(emitted, everyElement(isIn(allowed)));
  expect(emitted, isNot(contains(excludedRedditUrl)));
}

Future<void> _activateAuthorizedRowUrls(
  WidgetTester tester,
  Finder summaryList,
  Finder row,
  int rowIndex,
  String primaryUrl,
  Set<String> authorizedUrls,
  List<String> openedUrls,
) async {
  final toggles = find.descendant(
    of: row,
    matching: find.byKey(
      const ValueKey('reader-summary-top-post-evidence-toggle'),
    ),
  );
  for (var index = 0; index < toggles.evaluate().length; index++) {
    final toggle = toggles.at(index);
    await _scrollSummaryListUntilVisible(tester, summaryList, toggle);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
  }
  final menus = find.descendant(
    of: row,
    matching: find.byWidgetPredicate((widget) {
      final key = _stringKey(widget);
      return key.startsWith('reader-summary-url-menu-') &&
          !key.startsWith('reader-summary-url-menu-citation-');
    }),
  );
  expect(menus, findsOneWidget, reason: 'Post $rowIndex URL menu ACL');
  final menuKey = _stringKey(menus.evaluate().single.widget);
  await _scrollSummaryListUntilVisible(tester, summaryList, menus);
  await tester.tap(menus);
  await tester.pumpAndSettle();
  final identity = menuKey.substring('reader-summary-url-menu-'.length);
  final action = find.byKey(
    ValueKey('${_readerSummaryUrlActionKeyPrefix}post-menu-$identity'),
  );
  expect(action, findsOneWidget, reason: 'Missing URL menu item for $menuKey');
  final rowActivationStart = openedUrls.length;
  await tester.tap(action);
  await tester.pumpAndSettle();
  expect(openedUrls.last, primaryUrl);

  final targets = find.descendant(
    of: row,
    matching: find.byWidgetPredicate(
      (widget) =>
          _stringKey(widget).startsWith(_readerSummaryUrlActionKeyPrefix) &&
          !_stringKey(
            widget,
          ).startsWith('${_readerSummaryUrlActionKeyPrefix}post-card-'),
    ),
  );
  final targetElements = targets.evaluate().toList(growable: false);
  for (final element in targetElements) {
    final target = find.byElementPredicate((candidate) => candidate == element);
    await _scrollSummaryListUntilVisible(tester, summaryList, target);
    final beforeTarget = openedUrls.length;
    await tester.tap(target);
    await tester.pump();
    expect(openedUrls, hasLength(beforeTarget + 1));
  }
  final rowEmitted = openedUrls.skip(rowActivationStart).toList();
  expect(rowEmitted, hasLength(targetElements.length + 1));
  expect(
    rowEmitted,
    everyElement(isIn(authorizedUrls)),
    reason: 'Post $rowIndex may only activate its fixture-authorized URLs',
  );
  expect(
    rowEmitted.toSet(),
    containsAll(authorizedUrls),
    reason: 'Post $rowIndex must activate every fixture-authorized URL',
  );
  expect(rowEmitted, isNot(contains(excludedRedditUrl)));
  expectRejectedReaderSummaryContentAbsent();
}

const _summaryRowKeyPrefix = 'reader-summary-top-post-row-';

String _stringKey(Widget widget) {
  final key = widget.key;
  return key is ValueKey<String> ? key.value : '';
}
