import { DurableReaderSummaryExecutionAttestationCapture } from "./reader-summary-execution-attestation-capture";

describe("DurableReaderSummaryExecutionAttestationCapture", () => {
  it("keeps only the winning topic-map attempt", () => {
    const capture = new DurableReaderSummaryExecutionAttestationCapture();
    capture.record(attestation("topic_label", "1", "label-1"));
    capture.record(attestation("topic_relation", "1", "relation-1"));
    capture.record(attestation("topic_label", "2", "label-2"));
    capture.record(attestation("topic_relation", "2", "relation-2"));

    expect(
      capture
        .all()
        .map(({ taskRole, attempt, attestation: value }) => [
          taskRole,
          attempt,
          value.requestId,
        ]),
    ).toEqual([
      ["topic_label", "2", "label-2"],
      ["topic_relation", "2", "relation-2"],
    ]);
  });

  it("replaces a superseded summary result and preserves normalized hashes", () => {
    const capture = new DurableReaderSummaryExecutionAttestationCapture();
    capture.record(attestation("summary", "primary", "summary-primary"));
    capture.record(attestation("summary", "repair", "summary-repair"));

    expect(capture.all()).toMatchObject([
      {
        taskRole: "summary",
        attempt: "repair",
        normalizedOutputSha256: "c".repeat(64),
        attestation: { requestId: "summary-repair" },
      },
    ]);
  });
});

const attestation = (
  taskRole: "summary" | "topic_label" | "topic_relation",
  attempt: string,
  requestId: string,
) => ({
  taskRole,
  attempt,
  normalizedOutputSha256: "c".repeat(64),
  attestation: {
    schemaVersion: 1 as const,
    requestId,
    purpose:
      taskRole === "summary"
        ? attempt === "repair"
          ? "social_monitor.reader_summary.repair"
          : "social_monitor.reader_summary.generate"
        : taskRole === "topic_label"
          ? "social_monitor.reader_summary.topic_map.label"
          : "social_monitor.reader_summary.topic_map.verify_relations",
    canonicalRequestSha256: "a".repeat(64),
    provider: "codex" as const,
    model: "gpt-5.5",
    reasoningEffort: "xhigh",
    runtimeEngine: "subscription-runtime-cli" as const,
    runtimePackageVersion: "0.1.0-main.2",
    launcherSha256: "b".repeat(64),
    selectedOutputKind: "structured_output" as const,
    selectedOutputSha256: "d".repeat(64),
  },
});
