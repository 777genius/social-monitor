import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart' show RendererBinding;
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_generated_api/social_monitor_generated_api.dart'
    as generated;
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/generated_summary_rest_mapper.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_url_action_contract.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_top_posts_projection.dart';

const _topTitles = [
  'Anthropic publishes official watermark guidance',
  'Cursor agent update reaches HN',
  'GitHub 48 hour exact top',
  'Reddit exact top threshold',
  'SpaceX repository accelerates',
];
const _additionalTitles = [
  'GitHub 24 hour exact additional',
  'GitHub 48 hour exact additional',
  'HN exact additional threshold',
  'Reddit exact additional threshold',
  'X exact additional threshold',
];
const _cursorHnSupportUrl = 'https://news.ycombinator.com/item?id=cursor50';
const _topUrls = [
  'https://x.com/anthropic/status/watermark',
  _cursorHnSupportUrl,
  'https://github.com/fixture/top-48',
  'https://reddit.com/r/fixture/comments/top/story',
  'https://github.com/spacex/fixture',
];
const _additionalUrls = [
  'https://github.com/fixture/additional-24',
  'https://github.com/fixture/additional-48',
  'https://news.ycombinator.com/item?id=hn25',
  'https://reddit.com/r/fixture/comments/additional/story',
  'https://x.com/fixture/status/x35',
];
const _excludedRedditUrl =
    'https://reddit.com/r/fixture/comments/zero-nineteen/story';
const _cursorOfficialSupportUrl = 'https://x.com/cursor/status/fixture';
const _topRequiredSecondaryUrls = <String>{
  ..._topUrls,
  _cursorOfficialSupportUrl,
};
const _topAllowedSelectedCardAndSourceUrls = <String>{
  ..._topUrls,
  _cursorOfficialSupportUrl,
};
const _additionalRequiredSecondaryUrls = <String>{..._additionalUrls};
const _additionalAllowedSelectedCardAndSourceUrls = <String>{
  ..._additionalUrls,
};
const _absentTitles = [
  'Cursor official same-story note',
  'Duplicate Additional must lose to Top',
  'Eligible related topic must stay absent',
  'Reddit 7 score 5 comments absent',
  'Reddit 0 score 19 comments absent',
  'Negative controversy must stay absent',
  'X reply-only evidence absent',
  'Missing metrics absent',
  'Conflicting metrics absent',
  'X threshold minus one absent',
  'Reddit threshold minus one absent',
  'HN threshold minus one absent',
  'GitHub threshold minus one absent',
];

void main() {
  _LiveHttpTestWidgetsFlutterBinding();
  const fixtureBaseUrl = String.fromEnvironment(
    'READER_SUMMARY_HTTP_FIXTURE_BASE_URL',
  );

  testWidgets(
    'backend policy survives persistence REST generated Dart and Chrome ACL',
    (tester) async {
      expect(fixtureBaseUrl, isNotEmpty);
      tester.view.physicalSize = const Size(1200, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      final semantics = tester.ensureSemantics();
      final runtime = generated.createGeneratedApiRuntime(
        const generated.GeneratedApiConfiguration(baseUrl: fixtureBaseUrl),
      );
      addTearDown(() => runtime.close(force: true));

      final response = await tester.runAsync(
        () => runtime.rest.readerSummaries
            .readerSummaryControllerList(
              xWorkspaceId: '00000000-0000-7000-8000-000000000702',
              xTenantId: '00000000-0000-7000-8000-000000000701',
              xWorkspaceRole: 'viewer',
            )
            .timeout(const Duration(seconds: 20)),
      );
      expect(response, isNotNull);
      expect(response!.items, hasLength(1));
      final apiSummary = const GeneratedSummaryRestMapper().readerSummary(
        response.items.single,
      );
      final summary = const SummaryMapper().readerSummaryToDomain(apiSummary);
      final projection = readerSummaryTopPostsProjection(summary);

      expect(projection.curatedPosts.map((item) => item.title), _topTitles);
      expect(
        projection.additionalNotableStories.map((item) => item.title),
        _additionalTitles,
      );
      expect(
        projection.curatedPosts.map((item) => item.canonicalUrl),
        _topUrls,
      );
      expect(
        projection.additionalNotableStories.map((item) => item.canonicalUrl),
        _additionalUrls,
      );
      expect(projection.curatedPosts, hasLength(5));
      expect(projection.additionalNotableStories, hasLength(5));
      expect(projection.items.map((item) => item.title).toSet(), hasLength(10));
      expect(
        projection.items.where((item) => _absentTitles.contains(item.title)),
        isEmpty,
      );

      final openedUrls = <String>[];
      await tester.pumpWidget(
        _ReaderSummaryHttpE2eApp(summary: summary, onOpenUrl: openedUrls.add),
      );
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel('Top posts, 5 items'), findsOneWidget);
      for (final title in _topTitles) {
        expect(find.text(title), findsWidgets);
      }
      _expectAbsentFromTextAndSemantics();
      _expectExactRenderedOccurrence('Cursor agent update reaches HN');
      _expectExactRenderedOccurrence('SpaceX repository accelerates');
      await _activateEveryPostCardTarget(tester, _topUrls, openedUrls);
      expect(openedUrls, _topUrls);
      await _activateEveryEnabledUrlTarget(
        tester,
        openedUrls,
        laneCardUrls: _topUrls,
        requiredSecondaryUrls: _topRequiredSecondaryUrls,
        allowedSelectedCardAndSourceUrls: _topAllowedSelectedCardAndSourceUrls,
      );
      _expectAbsentFromTextAndSemantics();

      await tester.tap(
        find.byKey(
          const ValueKey('reader-summary-top-posts-board-additional-stories'),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.bySemanticsLabel('Additional stories, 5 items'),
        findsOneWidget,
      );
      for (final title in _additionalTitles) {
        expect(find.text(title), findsWidgets);
      }
      _expectAbsentFromTextAndSemantics();
      await _activateEveryPostCardTarget(tester, _additionalUrls, openedUrls);
      expect(
        openedUrls.sublist(openedUrls.length - _additionalUrls.length),
        _additionalUrls,
      );
      await _activateEveryEnabledUrlTarget(
        tester,
        openedUrls,
        laneCardUrls: _additionalUrls,
        requiredSecondaryUrls: _additionalRequiredSecondaryUrls,
        allowedSelectedCardAndSourceUrls:
            _additionalAllowedSelectedCardAndSourceUrls,
      );
      _expectAbsentFromTextAndSemantics();
      expect(openedUrls, isNot(contains(_excludedRedditUrl)));
      semantics.dispose();
    },
    skip: fixtureBaseUrl.isEmpty,
    timeout: const Timeout(Duration(minutes: 2)),
  );
}

final class _LiveHttpTestWidgetsFlutterBinding
    extends AutomatedTestWidgetsFlutterBinding {
  @override
  bool get overrideHttpClient => false;
}

void _expectAbsentFromTextAndSemantics() {
  final renderedText = _renderedText();
  final semanticsText = _renderedSemantics();
  final excludedUrlIdentity = readerSummaryUrlIdentity(_excludedRedditUrl);
  for (final title in _absentTitles) {
    expect(renderedText, isNot(contains(title)));
    expect(semanticsText, isNot(contains(title)));
    expect(find.bySemanticsLabel(title), findsNothing);
  }
  expect(renderedText, isNot(contains(_excludedRedditUrl)));
  expect(semanticsText, isNot(contains(_excludedRedditUrl)));
  expect(semanticsText, isNot(contains(excludedUrlIdentity)));
  expect(
    find.byWidgetPredicate((widget) {
      final key = widget.key?.toString() ?? '';
      return key.contains(_excludedRedditUrl) ||
          key.contains(excludedUrlIdentity) ||
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

Future<void> _activateEveryPostCardTarget(
  WidgetTester tester,
  List<String> expectedUrls,
  List<String> openedUrls,
) async {
  final activationStart = openedUrls.length;
  final targets = find.byWidgetPredicate(
    (widget) =>
        widget is InkWell &&
        widget.key is ValueKey<String> &&
        ((widget.key! as ValueKey<String>).value).startsWith(
          '${readerSummaryUrlActionKeyPrefix}post-card-',
        ),
  );
  expect(targets, findsNWidgets(expectedUrls.length));
  final elements = targets.evaluate().toList(growable: false);
  for (final element in elements) {
    final target = find.byElementPredicate((candidate) => candidate == element);
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    await tester.tap(target);
    await tester.pump();
  }
  expect(openedUrls, hasLength(activationStart + elements.length));
  expect(openedUrls.skip(activationStart), expectedUrls);
}

Future<void> _activateEveryEnabledUrlTarget(
  WidgetTester tester,
  List<String> openedUrls, {
  required List<String> laneCardUrls,
  required Set<String> requiredSecondaryUrls,
  required Set<String> allowedSelectedCardAndSourceUrls,
}) async {
  final activationStart = openedUrls.length;
  final rows = find.byWidgetPredicate(
    (widget) =>
        widget.key is ValueKey<String> &&
        ((widget.key! as ValueKey<String>).value).startsWith(
          'reader-summary-top-post-row-',
        ),
  );
  expect(rows, findsNWidgets(laneCardUrls.length));
  final toggles = find.descendant(
    of: rows,
    matching: find.byKey(
      const ValueKey('reader-summary-top-post-evidence-toggle'),
    ),
  );
  final toggleCount = toggles.evaluate().length;
  for (var index = 0; index < toggleCount; index++) {
    final toggle = toggles.at(index);
    expect(toggle, findsOneWidget, reason: 'Missing evidence toggle $index');
    await tester.ensureVisible(toggle);
    await tester.pumpAndSettle();
    await tester.tap(toggle);
    await tester.pumpAndSettle();
  }

  final menuKeys = find
      .descendant(
        of: rows,
        matching: find.byWidgetPredicate(
          (widget) =>
              widget.key is ValueKey<String> &&
              ((widget.key! as ValueKey<String>).value).startsWith(
                'reader-summary-url-menu-',
              ),
        ),
      )
      .evaluate()
      .map((element) => (element.widget.key! as ValueKey<String>).value)
      .toList(growable: false);
  expect(menuKeys, hasLength(laneCardUrls.length));
  for (final menuKey in menuKeys) {
    final trigger = find.byKey(ValueKey(menuKey));
    expect(
      trigger,
      findsOneWidget,
      reason: 'Missing URL menu trigger $menuKey',
    );
    await tester.ensureVisible(trigger);
    await tester.pumpAndSettle();
    await tester.tap(trigger);
    await tester.pumpAndSettle();
    final identity = menuKey.substring('reader-summary-url-menu-'.length);
    final actionKind = identity.startsWith('citation-')
        ? 'citation-source'
        : 'post-menu';
    final actionIdentity = identity.startsWith('citation-')
        ? identity.substring('citation-'.length)
        : identity;
    final action = find.byKey(
      readerSummaryUrlActionKey(actionKind, actionIdentity),
    );
    expect(
      action,
      findsOneWidget,
      reason: 'Missing URL menu item for $menuKey',
    );
    final beforeMenuAction = openedUrls.length;
    await tester.tap(action);
    await tester.pumpAndSettle();
    expect(openedUrls, hasLength(beforeMenuAction + 1));
  }

  final targets = find.descendant(
    of: rows,
    matching: find.byWidgetPredicate(
      (widget) =>
          widget.key is ValueKey<String> &&
          ((widget.key! as ValueKey<String>).value).startsWith(
            readerSummaryUrlActionKeyPrefix,
          ) &&
          !((widget.key! as ValueKey<String>).value).startsWith(
            '${readerSummaryUrlActionKeyPrefix}post-card-',
          ),
    ),
  );
  final targetElements = targets.evaluate().toList(growable: false);
  final before = openedUrls.length;
  for (final element in targetElements) {
    final target = find.byElementPredicate((candidate) => candidate == element);
    await tester.ensureVisible(target);
    await tester.pumpAndSettle();
    final beforeTarget = openedUrls.length;
    await tester.tap(target);
    await tester.pump();
    expect(openedUrls, hasLength(beforeTarget + 1));
  }
  final emitted = openedUrls.skip(before).toList(growable: false);
  expect(emitted, hasLength(targetElements.length));
  expect(emitted, everyElement(isIn(allowedSelectedCardAndSourceUrls)));
  expect(emitted, isNot(contains(_excludedRedditUrl)));
  final allEmitted = openedUrls.skip(activationStart).toList(growable: false);
  expect(allEmitted, everyElement(isIn(allowedSelectedCardAndSourceUrls)));
  expect(allEmitted.toSet(), containsAll(requiredSecondaryUrls));
  expect(allEmitted, isNot(contains(_excludedRedditUrl)));
}

final class _ReaderSummaryHttpE2eApp extends StatelessWidget {
  const _ReaderSummaryHttpE2eApp({
    required this.summary,
    required this.onOpenUrl,
  });

  final ReaderSummary summary;
  final ValueChanged<String> onOpenUrl;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: ReaderSummaryView.readOnly(
                summary: summary,
                isRefreshing: false,
                onOpenUrl: onOpenUrl,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
