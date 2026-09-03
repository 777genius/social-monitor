import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/application/contracts/reader_source_launcher.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_published_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_history_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/load_workspace_summary_use_case.dart';
import 'package:social_monitor_summaries/src/application/use_cases/open_reader_source_use_case.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_view.dart';
import 'package:social_monitor_summaries/src/presentation/pages/published_summary_page.dart';
import 'package:social_monitor_summaries/src/presentation/stores/published_summary_store.dart';

import '../../support/deferred_summary_review_catalog.dart';
import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('guest reuses summary view without review mutations', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      githubTrendingReaderSummaryApiDto(),
    );
    final catalog = DeferredSummaryReviewCatalog(
      const [],
      workspaceSummarySnapshot: WorkspaceSummarySnapshot(current: summary),
    );
    final store = PublishedSummaryStore(
      scope: summaryWorkspaceScope,
      loadLatest: LoadWorkspaceSummaryUseCase(catalog),
      loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      loadPublished: LoadPublishedSummaryUseCase(catalog),
      openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
    );
    addTearDown(store.dispose);
    final theme = AppTheme.light();
    await tester.pumpWidget(
      AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          home: Scaffold(body: PublishedSummaryPage(store: store)),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.byKey(const ValueKey('published-reader-summary-view')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('workspace-summary-header-band')),
      findsOneWidget,
    );
    expect(find.byType(ReaderSummaryView), findsOneWidget);
    expect(
      find.textContaining('Collected through 2026-06-26 18:58 UTC'),
      findsOneWidget,
    );
    expect(find.textContaining('next update in'), findsOneWidget);
    expect(find.byKey(const ValueKey('open-weekly-summary')), findsNothing);
    expect(find.text('Week'), findsOneWidget);

    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1200));
    await tester.pumpAndSettle();

    expect(find.byType(ReaderSummaryTopPostsSliver), findsNothing);
    expect(find.text('Topic recommendations'), findsNothing);
    expect(
      find.byKey(const ValueKey('workspace-summary-toolbar-generate')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-top-post-rating-1')),
      findsNothing,
    );
  });

  testWidgets('summary and top posts share browser-like copy behavior', (
    tester,
  ) async {
    String? clipboardText;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'Clipboard.setData') {
            clipboardText =
                (call.arguments as Map<Object?, Object?>)['text'] as String?;
          }
          return null;
        });
    addTearDown(
      () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );

    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );
    final catalog = DeferredSummaryReviewCatalog(
      const [],
      workspaceSummarySnapshot: WorkspaceSummarySnapshot(current: summary),
    );
    final store = PublishedSummaryStore(
      scope: summaryWorkspaceScope,
      loadLatest: LoadWorkspaceSummaryUseCase(catalog),
      loadHistory: LoadWorkspaceSummaryHistoryUseCase(catalog),
      loadPublished: LoadPublishedSummaryUseCase(catalog),
      openReaderSource: const OpenReaderSourceUseCase(_SourceLauncher()),
      summaryId: summary.id,
    );
    addTearDown(store.dispose);

    final theme = AppTheme.light();
    await tester.pumpWidget(
      AppHeadlessScope(
        theme: theme,
        appBuilder: (overlayBuilder) => MaterialApp(
          theme: theme,
          builder: overlayBuilder,
          home: SelectionArea(
            child: Scaffold(body: PublishedSummaryPage(store: store)),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(SelectionArea), findsOneWidget);
    await _selectAndCopy(tester, find.text('AI workspace summary').first, 3);
    expect(clipboardText, 'workspace');

    final topPost = find.descendant(
      of: find.byType(ReaderSummaryTopPostsSliver),
      matching: find.text('AI coding tools'),
    );
    final scrollView = find.byKey(
      const PageStorageKey<String>('published-summary-scroll-view'),
    );
    for (
      var attempt = 0;
      attempt < 12 && topPost.evaluate().isEmpty;
      attempt++
    ) {
      await tester.drag(scrollView, const Offset(0, -500));
      await tester.pumpAndSettle();
    }
    expect(topPost, findsOneWidget);
    await tester.ensureVisible(topPost);
    await _selectAndCopy(tester, topPost, 4);
    expect(clipboardText, 'coding');
  });
}

Future<void> _selectAndCopy(
  WidgetTester tester,
  Finder text,
  int offset,
) async {
  final target = text.first;
  final paragraph = tester.renderObject<RenderParagraph>(
    find.descendant(of: target, matching: find.byType(RichText)).first,
  );
  final gesture = await tester.startGesture(
    _textOffsetToPosition(paragraph, offset),
  );
  addTearDown(gesture.removePointer);
  await tester.pump(const Duration(milliseconds: 500));
  await gesture.up();
  await tester.pump();
  expect(paragraph.selections, isNotEmpty);
  expect(paragraph.selections.single.isCollapsed, isFalse);

  final platform = Theme.of(tester.element(target)).platform;
  final modifier = platform == TargetPlatform.macOS
      ? LogicalKeyboardKey.metaLeft
      : LogicalKeyboardKey.controlLeft;
  await tester.sendKeyDownEvent(modifier);
  await tester.sendKeyEvent(LogicalKeyboardKey.keyC);
  await tester.sendKeyUpEvent(modifier);
  await tester.pump();
}

Offset _textOffsetToPosition(RenderParagraph paragraph, int offset) {
  const caret = Rect.fromLTWH(0, 0, 2, 20);
  final localOffset =
      paragraph.getOffsetForCaret(TextPosition(offset: offset), caret) +
      Offset(0, paragraph.preferredLineHeight);
  return paragraph.localToGlobal(localOffset) + const Offset(0, -2);
}

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
