export const productionExecutionAttestations = () => [
  {
    taskRole: "summary",
    attempt: "primary",
    normalizedOutputSha256: "d".repeat(64),
    attestation: attestation(
      "summary-request",
      "social_monitor.reader_summary.generate.v2",
    ),
  },
  {
    taskRole: "topic_label",
    attempt: "1",
    normalizedOutputSha256: "e".repeat(64),
    attestation: attestation(
      "topic-label-request",
      "social_monitor.reader_summary.topic_map.label.v2",
    ),
  },
];

const attestation = (requestId: string, purpose: string) => ({
  schemaVersion: 1,
  requestId,
  purpose,
  canonicalRequestSha256: "a".repeat(64),
  provider: "codex",
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  runtimeEngine: "subscription-runtime-cli",
  runtimePackageVersion: "0.1.0-main.2",
  launcherSha256: "b".repeat(64),
  selectedOutputKind: "structured_output",
  selectedOutputSha256: "c".repeat(64),
});
