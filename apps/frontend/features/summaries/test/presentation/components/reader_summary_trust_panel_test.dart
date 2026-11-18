import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_trust_panel.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('shows readable trust verdict and wrapped badges', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1100, 700);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(_TestApp(summary: _trustSummary()));

    final title = find.text('Trust & evidence');
    final verdict = find.text('Needs confirmation').first;
    expect(
      tester.getTopLeft(verdict).dy,
      greaterThan(tester.getTopLeft(title).dy),
    );
    expect(find.text('Medium confidence'), findsOneWidget);
    expect(find.text('1 source group'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('toggles evidence from the whole trust panel surface', (
    tester,
  ) async {
    final summary = _trustSummary();
    await tester.pumpWidget(_TestApp(summary: summary));

    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsNothing,
    );

    await tester.tap(find.text('Trust & evidence'));
    await tester.pumpAndSettle();

    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsOneWidget,
    );

    // Expanded content is readable/selectable without collapsing the panel.
    await tester.tap(find.text('Reddit users report useful MCP agent workflows'));
    await tester.pumpAndSettle();
    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsOneWidget,
    );

    await tester.tap(
      find.text(
        'Treat this as a lead until another independent source group confirms the key items.',
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsNothing,
    );
  });

  testWidgets('expanded evidence reveals full selectable source copy', (
    tester,
  ) async {
    const viewport = Size(375, 800);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = viewport;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    const sourceTitle =
        'A detailed original post title about setting up a reliable MCP '
        'agent workflow, with a precise caveat that must remain readable '
        'at narrow mobile widths and increased text scaling.';
    await tester.pumpWidget(
      _TestApp(
        summary: _trustSummary(evidenceTitle: sourceTitle),
        viewport: viewport,
        textScaler: const TextScaler.linear(1.5),
      ),
    );
    await tester.tap(find.text('Trust & evidence'));
    await tester.pumpAndSettle();

    final source = find.text('Reddit [1] - $sourceTitle');
    expect(source, findsOneWidget);
    expect(tester.widget<SelectableText>(source).maxLines, isNull);
    expect(find.text('Source text'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('wraps trust copy at 375x800 with 1.5 text scaling', (
    tester,
  ) async {
    const viewport = Size(375, 800);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = viewport;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final summary = _trustSummary();
    await tester.pumpWidget(
      _TestApp(
        summary: summary,
        viewport: viewport,
        textScaler: const TextScaler.linear(1.5),
      ),
    );

    final panel = find.byType(ReaderSummaryTrustPanel);
    final title = find.text('Trust & evidence');
    final verdict = find.text('Needs confirmation').first;
    final description = find.text(
      'Treat this as a lead until another independent source group confirms the key items.',
    );
    expect(title, findsOneWidget);
    expect(description, findsOneWidget);
    expect(
      tester.getTopLeft(verdict).dy,
      greaterThan(tester.getTopLeft(title).dy),
    );
    for (final copy in [title, verdict, description]) {
      expect(
        tester.getRect(copy).right,
        lessThanOrEqualTo(tester.getRect(panel).right),
      );
    }
    expect(tester.takeException(), isNull);

    await tester.tap(find.byKey(const ValueKey('reader-summary-trust-toggle')));
    await tester.pumpAndSettle();

    expect(find.text('Medium confidence'), findsNWidgets(2));
    expect(
      find.text('Cited Reddit source with usable discussion.'),
      findsOneWidget,
    );
    expect(
      find.text('Reddit [1] - Thread evidence about MCP agent workflows'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}

ReaderSummary _trustSummary({
  String evidenceTitle = 'Thread evidence about MCP agent workflows',
}) {
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      content: readerSummaryContentApiDto(
        claimBoard: [
          SummaryClaimApiDto(
            claim: 'Reddit users report useful MCP agent workflows',
            evidence: [
              SummaryClaimEvidenceApiDto(
                title: evidenceTitle,
                providerKey: 'reddit',
                citationId: 'claim-citation',
                canonicalUrl: 'https://reddit.example/r/mcp/comments/1',
              ),
            ],
            confidence: TopReadConfidenceApiDto(
              level: 'medium',
              score: 0.63,
              rationale: 'Cited Reddit source with usable discussion.',
            ),
            risks: [
              SummaryClaimRiskApiDto(
                kind: 'single_source',
                description:
                    'Needs independent confirmation before treating it as verified.',
              ),
            ],
            citationIds: ['claim-citation'],
          ),
        ],
        reliabilityReport: SummaryReliabilityReportApiDto(
          mode: 'shadow',
          policyVersion: 'reader_summary_reliability_shadow_v1',
          riskLevel: 'medium',
          riskScore: 0.52,
          risks: [
            SummaryReliabilityRiskApiDto(
              kind: 'single_source',
              level: 'medium',
              score: 0.52,
              description:
                  'Important claims are not confirmed across providers yet.',
            ),
          ],
        ),
      ),
      citations: [
        SummaryCitationApiDto(
          id: 'claim-citation',
          sourceLabel: 'Reddit [1]',
          rawSnippet: 'Users describe MCP workflows.',
          feedItemId: 'feed-claim',
          sourceItemId: 'source-claim',
          providerKey: 'reddit',
          canonicalUrl: 'https://reddit.example/r/mcp/comments/1',
        ),
      ],
    ),
  );
}

class _TestApp extends StatelessWidget {
  const _TestApp({
    required this.summary,
    this.viewport = const Size(1100, 700),
    this.textScaler = TextScaler.noScaling,
  });

  final ReaderSummary summary;
  final Size viewport;
  final TextScaler textScaler;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: MediaQuery(
          data: MediaQueryData(size: viewport, textScaler: textScaler),
          child: Scaffold(
            body: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: ReaderSummaryTrustPanel(
                  claims: summary.content.claimBoard,
                  reliabilityReport: summary.content.reliabilityReport,
                  citationsById: {
                    for (final citation in summary.citations)
                      citation.id: citation,
                  },
                  onOpenUrl: (_) {},
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
