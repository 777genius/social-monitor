import 'package:flutter/material.dart';
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
    expect(find.byKey(const ValueKey('open-weekly-summary')), findsNothing);
    expect(find.text('Week'), findsOneWidget);

    await tester.drag(find.byType(CustomScrollView), const Offset(0, -1200));
    await tester.pumpAndSettle();

    expect(find.byType(ReaderSummaryTopPostsSliver), findsOneWidget);
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
}

final class _SourceLauncher implements ReaderSourceLauncher {
  const _SourceLauncher();

  @override
  Future<Result<Unit>> open(Uri uri) async => const Result.success(Unit.value);
}
