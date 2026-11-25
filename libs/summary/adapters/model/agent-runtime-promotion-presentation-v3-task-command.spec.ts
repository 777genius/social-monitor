import { activeReaderSummaryProvider,
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  codexReaderSummaryBackend,
  mimoReaderSummaryBackend,
  mimoReaderSummaryModel,
  mimoPresentationReasoningEffort,
  kimiCodeReaderSummaryBackend,
  kimiCodeReaderSummaryModel,
  openRouterReaderSummaryBackend,
  defaultOpenRouterReaderSummaryModel,
  gatewayDefaultReasoningEffort,
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

  it("rejects a direct cross-scope command before composing the model payload", () => {
    const first = fixture();
    const second = { ...fixture(), candidateId: "other-candidate" };
    for (const mixed of [
      { ...second, tenantId: "other-tenant" },
      { ...second, workspaceId: "other-workspace" },
    ]) {
      expect(() => createPromotionPresentationTaskCommand([first, mixed], route))
        .toThrow("V3 presentation batch mixes tenant or workspace scopes");
    }
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


  it.each([
    [kimiCodeReaderSummaryBackend, kimiCodeReaderSummaryModel],
    [openRouterReaderSummaryBackend, defaultOpenRouterReaderSummaryModel],
  ] as const)("keeps source-copy schema, controls and sealed digest aligned for %s", (backend, model) => {
    const input = Object.freeze(fixture());
    const routeForGateway = Object.freeze({
      ...route, modelBackend: backend, model,
      reasoningEffort: gatewayDefaultReasoningEffort,
    });
    const first = createPromotionPresentationTaskCommand([input], routeForGateway);
    const repeated = createPromotionPresentationTaskCommand([input], routeForGateway);
    const canonical = createPromotionPresentationTaskCommand([input], route);
    expect(first.sourceCopyWire).toBe(true);
    expect(first.command.outputSchema).not.toEqual(canonical.command.outputSchema);
    expect(first.command.systemPrompt).toContain("Return contractVersion mimo_qualified_headline.v1.");
    expect(first.command.controls).toMatchObject({ modelBackend: backend, model });
    expect(first.command.requestId).toBe(repeated.command.requestId);
    expect(first.command.correlationId).toBe(repeated.command.correlationId);
    expect(first.command.requestId).not.toBe(canonical.command.requestId);
    expect(first.command.tenantId).toBe(input.tenantId);
    expect(first.command.workspaceId).toBe(input.workspaceId);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(routeForGateway)).toBe(true);
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
    // Both existing prompt contracts contain bounded copy options; only their
    // output fields and instruction policies are backend-specific.
    expect(canonical.command.systemPrompt).toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
    expect(copied.command.systemPrompt).toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
    expect(canonical.command.systemPrompt).toContain("Keep the canonical response fields text and qualificationJudgment.");
    expect(copied.command.systemPrompt).toContain("Return contractVersion mimo_qualified_headline.v1.");
    expect(canonical.command.systemPrompt).not.toContain("Return contractVersion mimo_qualified_headline.v1.");
    expect(canonical.command.systemPrompt).not.toContain(first.trustedIntent);
    expect(copied.command.systemPrompt).not.toContain(first.trustedIntent);
    expect(before).toEqual([first, second]);
  });

  it("keeps timeout out of sealed identity but binds provider instance and scope", () => {
    const input = Object.freeze(fixture());
    const frozenRoute = Object.freeze({ ...route });
    const first = createPromotionPresentationTaskCommand([input], frozenRoute);
    const extendedTimeout = createPromotionPresentationTaskCommand([input], {
      ...frozenRoute, timeoutMs: 120_000,
    });
    const instanceA = createPromotionPresentationTaskCommand([input], {
      ...frozenRoute, providerInstanceId: "presentation-instance-a",
    });
    const instanceB = createPromotionPresentationTaskCommand([input], {
      ...frozenRoute, providerInstanceId: "presentation-instance-b",
    });
    expect(first.command.requestId).toBe(extendedTimeout.command.requestId);
    expect(first.command.correlationId).toBe(extendedTimeout.command.correlationId);
    expect(extendedTimeout.command.timeoutMs).toBe(120_000);
    expect(instanceA.command.requestId).not.toBe(first.command.requestId);
    expect(instanceA.command.requestId).not.toBe(instanceB.command.requestId);
    expect(instanceA.command.correlationId).not.toBe(instanceB.command.correlationId);
    expect(instanceA.command.tenantId).toBe(input.tenantId);
    expect(instanceA.command.workspaceId).toBe(input.workspaceId);
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(frozenRoute)).toBe(true);
  });
});
