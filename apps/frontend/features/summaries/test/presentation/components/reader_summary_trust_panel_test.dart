import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_design_system/social_monitor_design_system.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/infrastructure/api/summary_api_dto.dart';
import 'package:social_monitor_summaries/src/infrastructure/mappers/summary_mapper.dart';
import 'package:social_monitor_summaries/src/presentation/components/reader_summary_trust_panel.dart';

import '../../support/summaries_test_fixtures.dart';

void main() {
  testWidgets('keeps collapsed trust summary in one row on wide panels', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(1100, 700);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);

    final summary = _trustSummary();
    await tester.pumpWidget(_TestApp(summary: summary));

    final rowCenterY = tester.getCenter(find.text('Trust & evidence')).dy;
    for (final finder in [
      find.text('Needs confirmation').first,
      find.text(
        'Treat this as a lead until another independent source group confirms the key items.',
      ),
      find.text('Medium confidence'),
      find.text('Why trust this?'),
    ]) {
      expect((tester.getCenter(finder).dy - rowCenterY).abs(), lessThan(26));
    }
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

  testWidgets('keeps compact trust title within scaled text constraints', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(375, 800);
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(
      tester.platformDispatcher.clearTextScaleFactorTestValue,
    );

    await tester.pumpWidget(_TestApp(summary: _trustSummary()));

    expect(find.text('Trust & evidence'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

ReaderSummary _trustSummary() {
  return const SummaryMapper().readerSummaryToDomain(
    readerSummaryApiDto(
      content: readerSummaryContentApiDto(
        claimBoard: [
          SummaryClaimApiDto(
            claim: 'Reddit users report useful MCP agent workflows',
            evidence: [
              SummaryClaimEvidenceApiDto(
                title: 'Thread evidence about MCP agent workflows',
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
  const _TestApp({required this.summary});

  final ReaderSummary summary;

  @override
  Widget build(BuildContext context) {
    final theme = AppTheme.light();
    return AppHeadlessScope(
      theme: theme,
      appBuilder: (overlayBuilder) => MaterialApp(
        theme: theme,
        builder: overlayBuilder,
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: ReaderSummaryTrustPanel(
              claims: summary.content.claimBoard,
              reliabilityReport: summary.content.reliabilityReport,
              citationsById: {
                for (final citation in summary.citations) citation.id: citation,
              },
              onOpenUrl: (_) {},
            ),
          ),
        ),
      ),
    );
  }
}
