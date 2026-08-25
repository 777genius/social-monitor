import 'package:flutter_test/flutter_test.dart';
import 'package:social_monitor_summaries/src/domain/aggregates/reader_summary.dart';
import 'package:social_monitor_summaries/src/presentation/formatters/reader_summary_trust_copy.dart';
import 'package:social_monitor_summaries/src/presentation/view_models/reader_summary_trust_snapshot.dart';

void main() {
  test('keeps confidence badges reader-facing and score-free', () {
    expect(trustConfidenceBadgeLabel('low'), 'Low confidence');
    expect(trustEvidenceRiskBadgeLabel('medium'), 'Medium evidence risk');
  });

  test('summarizes the user action before evidence details', () {
    const snapshot = ReaderSummaryTrustSnapshot(
      confidenceLevel: 'low',
      confidenceScore: 0.42,
      sourceGroupCount: 1,
      needsConfirmation: true,
      hasMixedConfidence: false,
    );

    expect(trustVerdictTitle(snapshot), 'Needs confirmation');
    expect(trustSummaryConfidenceBadgeLabel(snapshot), 'Low confidence');
    expect(
      trustSummaryConfidenceBadgeLabel(
        const ReaderSummaryTrustSnapshot(
          confidenceLevel: 'low',
          confidenceScore: 0.42,
          sourceGroupCount: 3,
          needsConfirmation: true,
          hasMixedConfidence: true,
        ),
      ),
      'Mixed confidence',
    );
    expect(
      trustVerdictDescription(snapshot),
      'Treat this as a lead until another independent source group confirms the key items.',
    );
    expect(trustSourceGroupLabel(1), '1 source group');
  });

  test('explains missing independent confirmation without raw policy wording', () {
    const confidence = TopReadConfidence(
      level: 'low',
      score: 0.42,
      rationale:
          'This story has not been independently confirmed across monitored source groups yet.',
    );

    expect(
      trustConfidenceExplanation(confidence),
      'This story appears in monitored sources, but independent confirmation is missing.',
    );
  });

  test('explains cited source groups without overstating confirmation', () {
    const confidence = TopReadConfidence(
      level: 'medium',
      score: 0.67,
      rationale:
          '2 cited source groups support this story, but the key claim has not been fully cross-verified yet.',
    );

    expect(
      trustConfidenceExplanation(confidence),
      'Multiple cited source groups support this story, but the key claim has not been fully cross-verified yet.',
    );
  });

  test('hides backend clustering language from risk details', () {
    const risk = SummaryClaimRisk(
      kind: 'unresolved',
      description:
          'No backend cross-provider clusters were detected, so many items are isolated despite broad provider coverage.',
    );

    expect(
      trustClaimRiskDescription(risk),
      'The cited sources are not linked as one confirmed story yet; treat this as a lead.',
    );
  });

  test('marks single-source claims as not cross-verified', () {
    final claim = SummaryClaim(
      claim: 'Reader story',
      evidence: const [
        SummaryClaimEvidence(
          title: 'Reddit evidence',
          providerKey: 'reddit',
          citationId: 'c1',
        ),
      ],
      confidence: const TopReadConfidence(
        level: 'medium',
        score: 0.63,
        rationale: 'Cited Reddit source with usable discussion.',
      ),
      risks: const [
        SummaryClaimRisk(
          kind: 'single_source',
          description:
              'Needs independent confirmation before treating it as verified.',
        ),
      ],
      citationIds: const ['c1'],
    );

    expect(trustClaimSupportLabel(claim), 'Not independently confirmed');
    expect(
      trustClaimRiskDescription(claim.risks.first),
      'Treat this as a lead until another independent source group confirms it.',
    );
  });

  test('keeps multi-source support visible even when confidence is low', () {
    final claim = SummaryClaim(
      claim: 'Reader story',
      evidence: const [
        SummaryClaimEvidence(
          title: 'HN evidence',
          providerKey: 'hacker-news',
          citationId: 'c1',
        ),
        SummaryClaimEvidence(
          title: 'RSS evidence',
          providerKey: 'rss',
          citationId: 'c2',
        ),
      ],
      confidence: const TopReadConfidence(
        level: 'low',
        score: 0.42,
        rationale:
            'This story has not been independently confirmed across monitored source groups yet.',
      ),
      risks: const [
        SummaryClaimRisk(
          kind: 'low_confidence',
          description:
              'This story has not been independently confirmed across monitored source groups yet.',
        ),
      ],
      citationIds: const ['c1', 'c2'],
    );

    expect(trustClaimSupportLabel(claim), '2 source groups');
    expect(trustClaimLacksIndependentConfirmation(claim), isFalse);
    expect(trustClaimNeedsConfirmation(claim), isTrue);
  });

  test('keeps multi-source support visible for unresolved risks', () {
    final claim = SummaryClaim(
      claim: 'Reader story',
      evidence: const [
        SummaryClaimEvidence(
          title: 'HN evidence',
          providerKey: 'hacker-news',
          citationId: 'c1',
        ),
        SummaryClaimEvidence(
          title: 'RSS evidence',
          providerKey: 'rss',
          citationId: 'c2',
        ),
      ],
      confidence: const TopReadConfidence(
        level: 'medium',
        score: 0.61,
        rationale:
            '2 cited source groups support this story, but the key claim has not been fully cross-verified yet.',
      ),
      risks: const [
        SummaryClaimRisk(
          kind: 'unresolved',
          description: 'Important detail still needs review.',
        ),
      ],
      citationIds: const ['c1', 'c2'],
    );

    expect(trustClaimSupportLabel(claim), '2 source groups');
    expect(trustClaimLacksIndependentConfirmation(claim), isFalse);
    expect(trustClaimNeedsConfirmation(claim), isTrue);
  });
}
