// Summary-feedback negative scenario declarations only; the original checker owns I/O, execution and fail-closed diagnostics.
export function summaryFeedbackNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'summary feedback fixture sample id',
      expectedOutput: 'real feedback sample must not reuse fixture sample id',
      mutateArtifact: (artifact) => {
        artifact.samples[0].feedbackId = 'redacted-feedback-wrong-fact-001';
        artifact.rollup.blockerSampleIds[0] = 'redacted-feedback-wrong-fact-001';
      },
    },
    {
      label: 'summary feedback fixture sample signal text',
      expectedOutput: 'real feedback sample must not copy fixture sample signal text',
      mutateArtifact: (artifact) => {
        artifact.samples[0].sanitizedSignal = 'Summary asserted a decision that was not supported by the cited redacted item.';
        artifact.samples[0].redactedComment = 'The cited source only says review is pending, but the summary says it was approved.';
      },
    },
    {
      label: 'summary feedback fixture provenance',
      expectedOutput: 'must not contain fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for summary feedback sample schema validation.',
          runner: 'ops/release/fixtures/redacted-summary-feedback-samples-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'summary feedback non-real source kind',
      expectedOutput: 'real sample source.kind must be one of internal_dogfood, private_beta',
      mutateArtifact: (artifact) => {
        artifact.source.kind = 'example_redacted_dogfood';
      },
    },
    {
      label: 'summary feedback missing source export traceability',
      expectedOutput: 'source.export must be an object',
      mutateArtifact: (artifact) => {
        delete artifact.source.export;
      },
    },
    {
      label: 'summary feedback raw source redaction flag',
      expectedOutput: 'redaction.rawSourceTextIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawSourceTextIncluded = true;
      },
    },
    {
      label: 'summary feedback missing minimum samples',
      expectedOutput: 'samples must include at least 2 samples',
      mutateArtifact: (artifact) => {
        artifact.samples = [artifact.samples[0]];
        artifact.source.sampleCount = 1;
      },
    },
    {
      label: 'summary feedback rollup mismatch',
      expectedOutput: 'rollup.releaseBlockingSamples must match releaseBlocking samples',
      mutateArtifact: (artifact) => {
        artifact.rollup.releaseBlockingSamples = 0;
      },
    },
    {
      label: 'summary feedback forbidden sensitive field',
      expectedOutput: 'forbidden sensitive field "authorization"',
      mutateArtifact: (artifact) => {
        artifact.samples[0].summaryEvidence.authorization = 'redacted-header-name-only';
      },
    },
    {
      label: 'summary feedback raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"redactedComment": "Reviewer noted that the redacted item showed a pending state while the summary used approved wording."',
        [
          '"redactedComment": "',
          ['Bearer', ' raw-summary-feedback-token-hidden-by-duplicate-key'].join(''),
          '",\n      "redactedComment": "Reviewer noted that the redacted item showed a pending state while the summary used approved wording."',
        ].join(''),
      ),
    },
  ];
  return scenarios;
}
