import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_trust_snapshot.dart';

void main() {
  test('uses weakest claim confidence and provider diversity', () {
    final snapshot = ReaderSummaryTrustSnapshot.from(
      claims: [
        claim(
          confidence: const TopReadConfidence(
            level: 'medium',
            score: 0.64,
            rationale: 'Two providers confirm this story signal.',
          ),
          evidence: const [
            SummaryClaimEvidence(
              title: 'RSS evidence',
              providerKey: 'rss',
              citationId: 'c1',
            ),
            SummaryClaimEvidence(
              title: 'HN evidence',
              providerKey: 'hacker-news',
              citationId: 'c2',
            ),
          ],
        ),
        claim(
          confidence: const TopReadConfidence(
            level: 'low',
            score: 0.42,
            rationale: 'Single-source story signal.',
          ),
        ),
      ],
      report: emptySummaryReliabilityReport,
    );

    expect(snapshot.confidenceLevel, 'low');
    expect(snapshot.confidenceScore, 0.42);
    expect(snapshot.sourceGroupCount, 3);
    expect(snapshot.needsConfirmation, isTrue);
    expect(snapshot.hasMixedConfidence, isTrue);
  });

  test('marks trust summary as needing confirmation for reliability risks', () {
    final snapshot = ReaderSummaryTrustSnapshot.from(
      claims: [claim()],
      report: const SummaryReliabilityReport(
        mode: 'shadow',
        policyVersion: 'reader_summary_reliability_shadow_v1',
        riskLevel: 'medium',
        riskScore: 0.4,
        risks: [
          SummaryReliabilityRisk(
            kind: 'weak_source',
            level: 'medium',
            score: 0.55,
            description: 'Some selected evidence was down-ranked.',
          ),
        ],
      ),
    );

    expect(snapshot.sourceGroupCount, 1);
    expect(snapshot.needsConfirmation, isTrue);
    expect(snapshot.hasMixedConfidence, isFalse);
  });

  test('does not treat unrelated single-source claims as cross-confirmed', () {
    final snapshot = ReaderSummaryTrustSnapshot.from(
      claims: [
        claim(
          evidence: const [
            SummaryClaimEvidence(
              title: 'Reddit evidence',
              providerKey: 'reddit',
              citationId: 'c1',
            ),
          ],
        ),
        claim(
          evidence: const [
            SummaryClaimEvidence(
              title: 'HN evidence',
              providerKey: 'hacker-news',
              citationId: 'c2',
            ),
          ],
        ),
      ],
      report: emptySummaryReliabilityReport,
    );

    expect(snapshot.sourceGroupCount, 2);
    expect(snapshot.needsConfirmation, isTrue);
  });

  test('counts X aliases as one trust source group', () {
    final aliasSnapshot = ReaderSummaryTrustSnapshot.from(
      claims: [
        claim(evidence: const [
          SummaryClaimEvidence(
            title: 'X evidence',
            providerKey: 'x-twitter',
            citationId: 'x-1',
          ),
          SummaryClaimEvidence(
            title: 'Legacy Twitter evidence',
            providerKey: 'twitter',
            citationId: 'x-2',
          ),
        ]),
      ],
      report: emptySummaryReliabilityReport,
    );
    final crossSourceSnapshot = ReaderSummaryTrustSnapshot.from(
      claims: [
        claim(evidence: const [
          SummaryClaimEvidence(
            title: 'X evidence',
            providerKey: 'x',
            citationId: 'x-3',
          ),
          SummaryClaimEvidence(
            title: 'Reddit evidence',
            providerKey: 'reddit',
            citationId: 'reddit-1',
          ),
        ]),
      ],
      report: emptySummaryReliabilityReport,
    );

    expect(aliasSnapshot.sourceGroupCount, 1);
    expect(aliasSnapshot.needsConfirmation, isTrue);
    expect(crossSourceSnapshot.sourceGroupCount, 2);
  });
}

SummaryClaim claim({
  TopReadConfidence confidence = const TopReadConfidence(
    level: 'medium',
    score: 0.62,
    rationale: 'Usable cited evidence.',
  ),
  List<SummaryClaimEvidence> evidence = const [
    SummaryClaimEvidence(
      title: 'Reddit evidence',
      providerKey: 'reddit',
      citationId: 'c1',
    ),
  ],
}) {
  return SummaryClaim(
    claim: 'Reader story',
    evidence: evidence,
    confidence: confidence,
    risks: const [],
    citationIds: evidence.map((item) => item.citationId).toList(),
  );
}
