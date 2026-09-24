import {
  parseReaderSummaryOperatorCancellationArguments,
  runReaderSummaryOperatorCancellation,
  safeOperatorCancellationPreview,
} from "./reader-summary-operator-cancel";

const tenantId = "00000000-0000-4000-8000-000000000001";
const workspaceId = "00000000-0000-4000-8000-000000000002";
const jobId = "00000000-0000-4000-8000-000000000003";

describe("reader summary operator cancellation CLI", () => {
  it("is preview-only until it receives the exact reviewed hash and confirmation", async () => {
    const preview = parseReaderSummaryOperatorCancellationArguments([
      "--mode", "preview", "--tenant-id", tenantId, "--workspace-id", workspaceId,
      "--job-id", jobId,
    ]);
    const adapter = { preview: jest.fn(async () => [{ jobId, status: "running" }]),
      cancel: jest.fn(async () => [{ jobId, status: "cancelled" as const }]) };
    const result = await runReaderSummaryOperatorCancellation({ command: preview,
      cancellation: adapter });
    expect(result.mode).toBe("preview");
    if (result.mode !== "preview") throw new Error("invalid preview result");
    expect(result.rows[0]?.job).not.toContain(jobId);
    expect(adapter.cancel).not.toHaveBeenCalled();

    const apply = parseReaderSummaryOperatorCancellationArguments([
      "--mode", "apply", "--tenant-id", tenantId, "--workspace-id", workspaceId,
      "--job-id", jobId, "--preview-sha256", result.previewSha256,
      "--confirm", "cancel-reader-summary-jobs",
    ]);
    await expect(runReaderSummaryOperatorCancellation({ command: apply,
      cancellation: adapter })).resolves.toMatchObject({ mode: "applied" });
    expect(adapter.cancel).toHaveBeenCalledWith({ tenantId, workspaceId, jobIds: [jobId] });
  });

  it("rejects a stale preview or an apply without explicit confirmation", async () => {
    expect(() => parseReaderSummaryOperatorCancellationArguments([
      "--mode", "apply", "--tenant-id", tenantId, "--workspace-id", workspaceId,
      "--job-id", jobId, "--preview-sha256", "0".repeat(64),
    ])).toThrow("exact confirmation");
    const command = parseReaderSummaryOperatorCancellationArguments([
      "--mode", "apply", "--tenant-id", tenantId, "--workspace-id", workspaceId,
      "--job-id", jobId, "--preview-sha256", "0".repeat(64),
      "--confirm", "cancel-reader-summary-jobs",
    ]);
    const adapter = { preview: async () => [{ jobId, status: "running" }],
      cancel: async () => [{ jobId, status: "cancelled" as const }] };
    await expect(runReaderSummaryOperatorCancellation({ command, cancellation: adapter }))
      .rejects.toThrow("preview SHA-256");
  });

  it("redacts scoped identifiers from preview output", () => {
    const preview = safeOperatorCancellationPreview({ tenantId, workspaceId,
      rows: [{ jobId, status: "requested" }] });
    expect(JSON.stringify(preview)).not.toContain(tenantId);
    expect(JSON.stringify(preview)).not.toContain(workspaceId);
    expect(JSON.stringify(preview)).not.toContain(jobId);
  });

  it("rejects unscoped switches and ambiguous target arguments", () => {
    expect(() => parseReaderSummaryOperatorCancellationArguments([
      "--mode", "preview", "--tenant-id", tenantId,
      "--workspace-id", workspaceId, "--job-id", jobId,
      "--activate", "jev_primary_v3",
    ])).toThrow("arguments are invalid");
    expect(() => parseReaderSummaryOperatorCancellationArguments([
      "--mode", "preview", "--mode", "apply",
      "--tenant-id", tenantId, "--workspace-id", workspaceId,
      "--job-id", jobId,
    ])).toThrow("arguments are ambiguous");
  });
});
