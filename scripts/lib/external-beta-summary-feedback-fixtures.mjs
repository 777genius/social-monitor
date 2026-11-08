// Synthetic summary-feedback staging evidence builders. Caller retains fixture I/O.
/** Construct redacted summary feedback evidence from a caller-loaded fixture. */
export function summaryFeedbackSamplesArtifact(artifact) {
  const now = Date.now();
  const generatedAt = new Date(now - 60 * 1000).toISOString();
  const exportedAt = new Date(now - 90 * 1000).toISOString();
  const sampleWindowEndedAt = new Date(now - 2 * 60 * 1000).toISOString();
  const sampleWindowStartedAt = new Date(now - 26 * 60 * 60 * 1000).toISOString();

  replaceSummaryFeedbackFixtureSamples(artifact);
  artifact.provenance = {
    evidenceKind: 'redacted_real_feedback_samples',
    collectionMethod: 'Redacted internal dogfood feedback export captured from summary review queue.',
    runner: 'scripts/capture-summary-feedback-samples.ts',
    fixtureOnly: false,
  };
  artifact.generatedAt = generatedAt;
  artifact.source = {
    kind: 'internal_dogfood',
    environmentId: 'summary-dogfood-alpha-1',
    sampleWindow: {
      startedAt: sampleWindowStartedAt,
      endedAt: sampleWindowEndedAt,
    },
    operator: 'summary-owner-1',
    sampleCount: artifact.samples.length,
    collectionMethod: 'Redacted internal dogfood export collected from summary feedback API review queue.',
    redactedBy: 'summary-owner-1',
    approvedBy: 'security-owner-1',
    export: {
      sourceSystem: 'summary-feedback-api',
      exportId: 'SF-EXPORT-20260618-ALPHA',
      exportedAt,
      reviewQueue: 'summary-quality-review',
      redactionReviewId: 'SEC-REDACTION-4321',
      approvalReference: 'REL-APPROVAL-9876',
    },
  };
  artifact.redaction = {
    ...artifact.redaction,
    method: 'Identifiers and free-text comments were irreversibly redacted before release review.',
  };

  return artifact;
}

/** Reassign sample identities and bounded commentary while preserving original fixture order. */
function replaceSummaryFeedbackFixtureSamples(artifact) {
  const replacements = [
    {
      suffix: '001',
      sanitizedSignal: 'Internal dogfood review found a summary claim that outran the cited approval state.',
      redactedComment: 'Reviewer noted that the redacted item showed a pending state while the summary used approved wording.',
    },
    {
      suffix: '002',
      sanitizedSignal: 'Internal dogfood review found a citation attached to the wrong supporting metric.',
      redactedComment: 'Reviewer noted that the citation described context but did not prove the redacted metric.',
    },
    {
      suffix: '003',
      sanitizedSignal: 'Internal dogfood review found a newer in-window item omitted from the summary.',
      redactedComment: 'Reviewer noted that an in-window item with relevant evidence was absent from the final summary.',
    },
  ];

  artifact.samples = artifact.samples.map((sample, index) => {
    const replacement = replacements[index] ?? replacements[0];
    return {
      ...sample,
      feedbackId: `dogfood-feedback-summary-${replacement.suffix}`,
      summaryEvidence: {
        ...sample.summaryEvidence,
        summaryId: `dogfood-summary-${replacement.suffix}`,
        interestId: 'dogfood-topic-summary-001',
        citationId: `dogfood-citation-${replacement.suffix}`,
        feedItemId: `dogfood-feed-item-${replacement.suffix}`,
        sourceItemId: `dogfood-source-item-${replacement.suffix}`,
      },
      sanitizedSignal: replacement.sanitizedSignal,
      redactedComment: replacement.redactedComment,
    };
  });
  artifact.rollup.blockerSampleIds = artifact.samples
    .filter((sample) => sample.classification === 'blocker')
    .map((sample) => sample.feedbackId);
}

