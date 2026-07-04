import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_shared_kernel/social_monitor_shared_kernel.dart';
import 'package:social_monitor_summaries/src/domain/value_objects/reader_action_target.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_brief_surface.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('submits helpful feedback through the feedback bar', (
    tester,
  ) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );
    final submitted = <String>[];

    await _pumpBar(
      tester,
      ReaderSummaryFeedbackBar(
        summary: summary,
        readerActionState: const InitialViewState<ReaderActionResult>(),
        intentForAction: (action) => UserActionIntent(id: action.kind),
        onAction: (action, [reason]) => submitted.add(action.kind),
      ),
    );

    expect(find.text('Was this summary helpful?'), findsOneWidget);
    await tester.tap(
      find.byKey(const ValueKey('reader-summary-feedback-helpful')),
    );
    expect(submitted, ['mark_relevant']);
  });

  testWidgets('not helpful requires a reason from the menu', (tester) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );
    ReaderFeedbackReason? submittedReason;

    await _pumpBar(
      tester,
      ReaderSummaryFeedbackBar(
        summary: summary,
        readerActionState: const InitialViewState<ReaderActionResult>(),
        intentForAction: (action) => UserActionIntent(id: action.kind),
        onAction: (action, [reason]) => submittedReason = reason,
      ),
    );

    await tester.tap(
      find.byKey(const ValueKey('reader-summary-feedback-not-helpful')),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text(ReaderFeedbackReason.duplicate.label));
    await tester.pumpAndSettle();

    expect(submittedReason, ReaderFeedbackReason.duplicate);
  });

  testWidgets('shows thanks state after feedback is recorded', (tester) async {
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(),
    );

    await _pumpBar(
      tester,
      ReaderSummaryFeedbackBar(
        summary: summary,
        readerActionState: const ReadyViewState<ReaderActionResult>(
          ReaderActionResult(
            actionId: 'a-1',
            idempotencyKey: 'k-1',
            kind: 'mark_relevant',
            created: true,
            learningDirection: 'positive',
          ),
        ),
        intentForAction: (action) => UserActionIntent(id: action.kind),
        onAction: (action, [reason]) {},
      ),
    );

    expect(
      find.byKey(const ValueKey('reader-summary-feedback-thanks')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('reader-summary-feedback-helpful')),
      findsNothing,
    );
  });
}

Future<void> _pumpBar(WidgetTester tester, Widget bar) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light(),
      home: Scaffold(
        body: Padding(padding: const EdgeInsets.all(AppSpacing.md), child: bar),
      ),
    ),
  );
}
