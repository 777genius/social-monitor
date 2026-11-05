part of 'reader_summary_top_posts_test.dart';

void _registerTrustEvidenceTest() {
  testWidgets('shows compact trust summary and expands cited evidence', (
    tester,
  ) async {
    String? openedUrl;
    final summary = const SummaryMapper().readerSummaryToDomain(
      readerSummaryApiDto(
        content: readerSummaryContentApiDto(
          claimBoard: const [
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
          reliabilityReport: const SummaryReliabilityReportApiDto(
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
          summaryCitationApiDto(id: 'bc-1', providerKey: 'github-repo-radar'),
          summaryCitationApiDto(
            id: 'claim-citation',
            sourceLabel: 'Reddit [1]',
            providerKey: 'reddit',
            canonicalUrl: 'https://reddit.example/r/mcp/comments/1',
          ),
        ],
      ),
    );

    await tester.pumpWidget(
      _TestApp(summary: summary, onOpenUrl: (url) => openedUrl = url),
    );
    await tester.pumpAndSettle();

    expect(find.text('Trust & evidence'), findsOneWidget);
    expect(find.text('Needs confirmation'), findsWidgets);
    expect(
      find.text(
        'Treat this as a lead until another independent source group confirms the key items.',
      ),
      findsOneWidget,
    );
    expect(find.text('Medium confidence'), findsOneWidget);
    expect(find.text('1 source group'), findsOneWidget);
    expect(find.text('Medium evidence risk'), findsOneWidget);
    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsNothing,
    );
    expect(find.textContaining('Thread evidence about MCP'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('reader-summary-trust-toggle')));
    await tester.pumpAndSettle();

    expect(
      find.text('Reddit users report useful MCP agent workflows'),
      findsOneWidget,
    );
    expect(find.textContaining('Thread evidence about MCP'), findsOneWidget);
    expect(find.text('1 citation'), findsOneWidget);
    expect(find.text('Not independently confirmed'), findsOneWidget);
    expect(
      find.text(
        'Treat this as a lead until another independent source group confirms it.',
      ),
      findsOneWidget,
    );

    final sourceButton = find.byKey(
      const ValueKey('reader-summary-url-action-trust-evidence-claim-citation'),
    );
    await tester.scrollUntilVisible(
      sourceButton,
      120,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(sourceButton);
    expect(openedUrl, 'https://reddit.example/r/mcp/comments/1');
  });
}
