import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_url_action_contract.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('exposes and activates every Markdown brief URL contract', (
    tester,
  ) async {
    const url = 'https://official.example.test/brief-source';
    final semantics = tester.ensureSemantics();
    final openedUrls = <String>[];
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(executiveSummary: '[Official source]($url)'),
    );
    final identity = readerSummaryUrlIdentity(url);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: SingleChildScrollView(
            child: ReaderSummaryBriefSurface(
              summary: summary,
              citationsById: const {},
              isRefreshing: false,
              onOpenUrl: openedUrls.add,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    final target = find.byKey(
      readerSummaryUrlActionKey('brief-markdown-link', identity),
    );
    expect(target, findsOneWidget);
    expect(
      find.bySemanticsLabel(
        RegExp(
          '^${RegExp.escape(readerSummaryUrlActionSemantics('brief-markdown-link', identity))}',
        ),
      ),
      findsOneWidget,
    );
    await tester.tap(target);
    expect(openedUrls, [url]);
    semantics.dispose();
  });
}
