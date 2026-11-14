import { activeReaderSummaryProvider,
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  mimoPresentationReasoningEffort,
} from "./active-reader-summary-generation-profile";
import { createPromotionPresentationTaskCommand } from "./agent-runtime-promotion-presentation-v3-task-command";

const fixture = () => ({
  tenantId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  interestId: "00000000-0000-4000-8000-000000000003",
  candidateId: "00000000-0000-4000-8000-000000000004",
  sourceItemId: "00000000-0000-4000-8000-000000000005",
  sourceBindingId: "00000000-0000-4000-8000-000000000006",
  providerKey: "rss",
  trustedIntent: "private workspace research interest",
  sourceSnapshotSha256: "1".repeat(64),
  title: "Useful database method",
  body: "Useful body source.",
  captureComplete: true,
});

describe("promotion presentation task wire materialization", () => {
  const route = {
    provider: activeReaderSummaryProvider,
    model: activeReaderSummaryModel,
    modelBackend: codexReaderSummaryBackend,
    reasoningEffort: activeReaderSummaryReasoningEffort,
    timeoutMs: 90_000,
    maxOutputTokens: 2_400,
  } as const;

  it("binds command identity to scope and input provenance without exposing private intent in IDs", () => {
    const input = fixture();
    const first = createPromotionPresentationTaskCommand([input], route);
    const repeat = createPromotionPresentationTaskCommand([input], route);
    const altered = createPromotionPresentationTaskCommand([
      { ...input, sourceSnapshotSha256: "2".repeat(64) },
    ], route);
    expect(first.command).toEqual(repeat.command);
    expect(first.command.requestId).not.toEqual(altered.command.requestId);
    expect(first.command.tenantId).toBe(input.tenantId);
    expect(first.command.workspaceId).toBe(input.workspaceId);
    expect(first.command.requestId).not.toContain(input.trustedIntent);
    expect(first.command.correlationId).not.toContain(input.trustedIntent);
    expect(first.command.controls).toMatchObject({
      interactive: false,
      schemaVersion: "reader_post_presentation.v3",
      model: activeReaderSummaryModel,
      maxOutputTokens: 2_400,
    });
    expect(JSON.parse(first.command.prompt)).toEqual({
      candidates: [{ candidateId: input.candidateId, title: input.title, sourceText: input.body }],
    });
    expect(first.sourceCopyWire).toBe(false);
  });

  it("uses source-copy schema and effort policy only for attested MiMo route", () => {
    const input = fixture();
    const mimo = createPromotionPresentationTaskCommand([input], {
      ...route,
      model: mimoReaderSummaryModel,
      modelBackend: mimoReaderSummaryBackend,
      reasoningEffort: mimoPresentationReasoningEffort,
    });
    expect(mimo.sourceCopyWire).toBe(true);
    expect(mimo.command.controls).toMatchObject({
      modelBackend: mimoReaderSummaryBackend,
      maxOutputTokens: 2_400,
    });
    expect(mimo.command.requestId).not.toEqual(
      createPromotionPresentationTaskCommand([input], route).command.requestId,
    );
    expect(mimo.command.systemPrompt).toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
  });

  it("keeps ordered source candidates and route-specific sealed request identities", () => {
    const first = fixture();
    const second = { ...fixture(), candidateId: "00000000-0000-4000-8000-000000000007",
      title: "Second source item", body: "Second trusted source copy." };
    const before = [first, second];
    const canonical = createPromotionPresentationTaskCommand(before, route);
    const reordered = createPromotionPresentationTaskCommand([second, first], route);
    const copied = createPromotionPresentationTaskCommand(before, {
      ...route, model: mimoReaderSummaryModel, modelBackend: mimoReaderSummaryBackend,
      reasoningEffort: mimoPresentationReasoningEffort,
    });
    const expectedCandidates = before.map(input => ({
      candidateId: input.candidateId, title: input.title, sourceText: input.body,
    }));
    expect(JSON.parse(canonical.command.prompt)).toEqual({ candidates: expectedCandidates });
    expect(copied.command.prompt).toBe(canonical.command.prompt);
    expect(canonical.command.requestId).not.toBe(reordered.command.requestId);
    expect(copied.command.requestId).not.toBe(canonical.command.requestId);
    expect(copied.command.outputSchema).not.toEqual(canonical.command.outputSchema);
    expect(copied.command.systemPrompt).toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
    expect(canonical.command.systemPrompt).not.toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
    expect(canonical.command.systemPrompt).not.toContain(first.trustedIntent);
    expect(copied.command.systemPrompt).not.toContain(first.trustedIntent);
    expect(before).toEqual([first, second]);
  });
});
