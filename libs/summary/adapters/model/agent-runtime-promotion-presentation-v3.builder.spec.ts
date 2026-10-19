import { withTestExecutionAttestation } from "./reader-summary-execution-attestation.spec-support";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand, AgentRuntimeTaskResult } from "../../ports";
import {
  AgentRuntimePromotionPresentationV3Builder,
  resolveAgentRuntimePromotionPresentationV3BuilderOptions,
} from "./agent-runtime-promotion-presentation-v3.builder";

describe("AgentRuntimePromotionPresentationV3Builder", () => {
  it("preserves a failed MiMo task instead of misclassifying it as a completed attestation failure", async () => {
    const client = new PresentationRuntimeClient();
    jest.spyOn(client as AgentRuntimeClientPort, "runTask").mockResolvedValueOnce({
      status: "failed", warnings: [], failure: {
        code: "provider_output_invalid", safeMessage: "Structured output schema rejected",
        retryable: false, reconnectRequired: false, causeCategory: "schema", details: {},
      },
    });
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()])).rejects.toMatchObject({
      failure: { kind: "invalid_schema", retryable: false, message: "Structured output schema rejected" },
    });
  });
  it.each(["unknown_runtime_failure", "provider_output_invalid"] as const)(
    "discards a schema-rejected batch with %s without trusting its output", async (code) => {
      const client = new PresentationRuntimeClient();
      jest.spyOn(client, "runTask").mockResolvedValueOnce({ status: "failed", warnings: [],
        structuredOutput: { presentations: [] }, failure: {
          code, safeMessage: "Rejected", retryable: false, reconnectRequired: false,
          causeCategory: "agent_runtime", details: {
            outputValidationStage: "schema_normalization",
            outputValidationCode: "schema_normalization_failed",
          },
        } });
      await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
        modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()]))
        .resolves.toEqual([{ status: "unavailable", reason: "invalid_presentation" }]);
      expect(client.runTask).toHaveBeenCalledTimes(1);
    });

  it.each<Record<string, string>>([
    { outputValidationStage: "json_parse", outputValidationCode: "schema_normalization_failed" },
    { outputValidationStage: "schema_normalization", outputValidationCode: "json_parse_failed" },
    { outputValidationStage: "schema_normalization" },
  ])("does not hide unrelated runtime failures %j", async (details) => {
    const client = new PresentationRuntimeClient();
    jest.spyOn(client, "runTask").mockResolvedValueOnce({ status: "failed", warnings: [],
      failure: { code: "unknown_runtime_failure", safeMessage: "Failed", retryable: false,
        reconnectRequired: false, causeCategory: "agent_runtime", details } });
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()])).rejects.toBeDefined();
  });

  it.each([
    ["unknown_runtime_failure", "product_contract_rejected", "true", "false"],
    ["provider_output_invalid", "product_contract_rejected", "true", "false"],
    ["unknown_runtime_failure", "schema_parse_or_normalization", "false", "not_returned"],
    ["provider_output_invalid", "schema_parse_or_normalization", "false", "not_returned"],
  ] as const)(
    "isolates a MiMo rejected story with %s at %s without reading failed output", async (code, stage, called, accepted) => {
      const client = new AttestedPresentationRuntimeClient();
      const failed: AgentRuntimeTaskResult = { status: "failed", warnings: [], failure: {
        code, safeMessage: "Rejected", retryable: false, reconnectRequired: false,
        causeCategory: "agent_runtime", details: {
          presentationValidationStage: stage,
          presentationOutputValidatorCalled: called, presentationOutputValidatorAccepted: accepted,
          ...(stage === "product_contract_rejected" ? {
            presentationRejectedPredicate: "qualification", presentationRejectedCandidateIndex: "0",
          } : {}),
        },
      } };
      Object.defineProperty(failed, "structuredOutput", { get: () => {
        throw new Error("Failed output must never be read");
      } });
      jest.spyOn(client, "runTask").mockImplementationOnce(async command => {
        client.commands.push(command);
        return failed;
      });
      const inputs = [fixtureInput(), { ...fixtureInput(), candidateId: "other-candidate" }];
      await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
        modelBackend: "xiaomi-mimo-token-plan" }).build(inputs)).resolves.toEqual([
        { status: "unavailable", reason: "invalid_presentation" },
        expect.objectContaining({ status: "available" }),
      ]);
      expect(client.runTask).toHaveBeenCalledTimes(2);
      expect(client.commands.map(command => JSON.parse(command.prompt).candidates.length))
        .toEqual([1, 1]);
      expect(client.commands[0]?.requestId).not.toBe(client.commands[1]?.requestId);
    });

  it.each([
    { modelBackend: "xiaomi-mimo-token-plan", stage: "other", called: "true", accepted: "false" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "product_contract_rejected", called: "false", accepted: "false" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "product_contract_rejected", called: "true", accepted: "true" },
    { modelBackend: undefined, stage: "product_contract_rejected", called: "true", accepted: "false" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "schema_parse_or_normalization", called: "true", accepted: "not_returned" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "schema_parse_or_normalization", called: "false", accepted: "false" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "product_validator_exception", called: "false", accepted: "not_returned" },
    { modelBackend: "xiaomi-mimo-token-plan", stage: "schema_parse_or_normalization", called: "false", accepted: undefined },
    { modelBackend: undefined, stage: "schema_parse_or_normalization", called: "false", accepted: "not_returned" },
  ] as const)("preserves failures outside the exact MiMo product rejection contract %j", async row => {
    const client = new PresentationRuntimeClient();
    jest.spyOn(client, "runTask").mockResolvedValueOnce({ status: "failed", warnings: [],
      failure: { code: "unknown_runtime_failure", safeMessage: "Failed", retryable: false,
        reconnectRequired: false, causeCategory: "agent_runtime", details: {
          presentationValidationStage: row.stage, presentationOutputValidatorCalled: row.called,
          ...(row.accepted === undefined ? {} : { presentationOutputValidatorAccepted: row.accepted }),
        } } });
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: row.modelBackend }).build([fixtureInput()])).rejects.toBeDefined();
  });

  it("preserves quota failures even when rejected-output flags are present", async () => {
    const client = new PresentationRuntimeClient();
    jest.spyOn(client, "runTask").mockResolvedValueOnce({ status: "failed", warnings: [],
      failure: { code: "quota_limited", safeMessage: "Quota unavailable", retryable: true,
        reconnectRequired: false, causeCategory: "provider", details: {
          presentationValidationStage: "schema_parse_or_normalization",
          presentationOutputValidatorCalled: "false", presentationOutputValidatorAccepted: "not_returned",
        } } });
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()])).rejects.toBeDefined();
  });

  it("does not mask transport exceptions as invalid presentations", async () => {
    const client = new PresentationRuntimeClient();
    const failure = new Error("Transport unavailable");
    jest.spyOn(client, "runTask").mockRejectedValueOnce(failure);
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()])).rejects.toBe(failure);
  });

  it("uses the configured runtime provider without sending private interest text", async () => {
    const client = new PresentationRuntimeClient();
    const input = fixtureInput();
    const builder = new AgentRuntimePromotionPresentationV3Builder({
      client,
      agentProvider: "codex",
      model: "gpt-5.6-sol",
      timeoutMs: 1_234,
    });

    const result = await builder.build([input]);

    expect(result[0]).toMatchObject({ status: "available" });
    expect(client.commands[0]).toMatchObject({
      provider: "codex",
      purpose: "social_monitor.reader_summary.promotion_presentation.v3",
      timeoutMs: 1_234,
      controls: expect.objectContaining({ model: "gpt-5.6-sol" }),
    });
    expect(client.commands[0]?.prompt).not.toContain(input.trustedIntent);
  });

  it("uses MiMo for V3 presentation when the daily backend is MiMo", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const builder = new AgentRuntimePromotionPresentationV3Builder(
      resolveAgentRuntimePromotionPresentationV3BuilderOptions({
        AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
        AGENT_RUNTIME_READER_SUMMARY_MODEL: "gpt-5.6-sol",
      }, client));
    expect((await builder.build([fixtureInput()]))[0]).toMatchObject({ status: "available" });
    expect(client.commands[0]?.controls).toMatchObject({
      model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan",
      reasoningEffort: "none", outputSchemaName: "social_monitor_reader_post_presentation_v3",
      schemaVersion: "reader_post_presentation.v3",
    });
  });

  it("gives MiMo exact decoded-source copy options without changing the original candidate projection", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const input = { ...fixtureInput(), body: `Useful ${"x".repeat(248)}😀 "quoted" source.\nMore source.` };
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" });
    const original = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      const result = await original(command);
      const options = JSON.parse(command.systemPrompt!.split("\nSOURCE_REFERENCE_COPY_OPTIONS=")[1]!);
      const output = result.structuredOutput as { presentations: Record<string, unknown>[] };
      return withTestExecutionAttestation(command, { ...result, structuredOutput: {
        contractVersion: "mimo_qualified_headline.v1", presentations: output.presentations.map(row => ({ ...row, support: [options[0].references[0]] })),
      } });
    });
    expect((await builder.build([input]))[0]).toMatchObject({ status: "available" });
    const command = client.commands[0]!;
    expect(JSON.parse(command.prompt)).toEqual({ candidates: [{
      candidateId: input.candidateId, title: input.title, sourceText: input.body,
    }] });
    expect(command.systemPrompt).toContain("end is exclusive in JavaScript UTF-16 code units");
    expect(command.systemPrompt).toContain("never translated or paraphrased");
    expect(command.systemPrompt).toContain("fieldText.slice(start,end) must equal quote exactly");
    expect(command.systemPrompt).toContain("global 8/512/1024 reference budgets");
    expect(command.systemPrompt).toContain("Every declared phrase will appear literally");
    expect(command.systemPrompt).toContain("Never include URLs, angle brackets, control characters");
    expect(command.systemPrompt).toContain("never truncate it or add an ellipsis");
    expect(command.systemPrompt).toContain("Avoid first-person or conversational openings");
    expect(command.systemPrompt).toContain("counting astral characters as two units");
    expect(command.systemPrompt).toContain("support must contain exactly 2 or 3 distinct whole-token copy options");
    expect(command.systemPrompt).toContain("benchmark, compiler, model, editor, API, release, safety, latency");
    expect(command.systemPrompt).toContain("support quotes joined with single spaces followed by ' discussion'");
    expect(command.systemPrompt).toContain("For unavailable output, still return every required schema field");
    expect(command.systemPrompt).toContain("return unavailable");
    const options = JSON.parse(command.systemPrompt!.split("\nSOURCE_REFERENCE_COPY_OPTIONS=")[1]!) as
      { candidateId: string; references: { field: string; start: number; end: number; quote: string }[] }[];
    expect(options).toHaveLength(1);
    expect(options[0]!.candidateId).toBe(input.candidateId);
    expect(options[0]!.references.length).toBeGreaterThan(2);
    for (const ref of options[0]!.references) {
      const source = ref.field === "title" ? input.title : input.body;
      expect(ref.quote).toBe(source.slice(ref.start, ref.end));
      expect(ref.end - ref.start).toBe(ref.quote.length);
      expect(ref.quote.length).toBeLessThanOrEqual(64);
      expect(JSON.stringify(ref.quote).length).toBeLessThanOrEqual(128);
      expect(ref.quote).not.toMatch(/[\uD800-\uDBFF]$/u);
      expect(ref.quote).not.toMatch(/^[\uDC00-\uDFFF]/u);
    }
    expect(command.systemPrompt).not.toContain(input.trustedIntent);
    const codex = new PresentationRuntimeClient();
    await new AgentRuntimePromotionPresentationV3Builder({ client: codex }).build([fixtureInput()]);
    expect(codex.commands[0]?.systemPrompt).not.toContain("SOURCE_REFERENCE_COPY_OPTIONS=");
  });

  it("composes every declared material qualification before sealing the headline", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const original = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      const result = await original(command);
      const options = JSON.parse(command.systemPrompt!.split("\nSOURCE_REFERENCE_COPY_OPTIONS=")[1]!);
      const reference = options[0].references.find((ref: { field: string }) => ref.field === "bodyPreview");
      const output = result.structuredOutput as { presentations: Record<string, unknown>[] };
      return withTestExecutionAttestation(command, { ...result, structuredOutput: {
        contractVersion: "mimo_qualified_headline.v1", presentations: output.presentations.map(row => ({ ...row, support: [reference],
          qualifications: [{ phrase: "limited", evidence: [reference] }] })),
      } });
    });
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" });
    expect((await builder.build([{ ...fixtureInput(), body: "Useful method with limited evidence." }]))[0])
      .toMatchObject({ status: "available", seal: { headline: { text: "Useful database method (limited)" } } });
  });

  it("isolates MiMo identity from Codex without changing exact MiMo retries", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const codex = new AgentRuntimePromotionPresentationV3Builder({ client });
    const mimo = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan", model: "mimo-v2.6-pro" });
    await codex.build([fixtureInput()]);
    await mimo.build([fixtureInput()]);
    await mimo.build([fixtureInput()]);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[1]?.requestId);
    expect(client.commands[1]?.requestId).toBe(client.commands[2]?.requestId);
  });

  it("refuses MiMo output without physical execution attestation", async () => {
    const builder = new AgentRuntimePromotionPresentationV3Builder({
      client: new PresentationRuntimeClient(), modelBackend: "xiaomi-mimo-token-plan" });
    await expect(builder.build([fixtureInput()])).rejects.toThrow("execution attestation is invalid");
  });

  it("rejects a fallback model attestation before sealing a headline", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const original = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      const result = await original(command);
      return { ...result, executionAttestation: {
        ...result.executionAttestation!, model: "gpt-5.6-sol",
      } };
    });
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" });
    await expect(builder.build([fixtureInput()])).rejects.toThrow("execution attestation is invalid");
  });

  it("keeps thinking-off exclusive to MiMo presentation and preserves the shared high parser", () => {
    const client = new PresentationRuntimeClient();
    expect(() => new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high" })).toThrow();
    expect(() => new AgentRuntimePromotionPresentationV3Builder({ client,
      reasoningEffort: "none" })).toThrow();
    expect(resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "high",
    }, client).reasoningEffort).toBe("none");
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT: "none",
    }, client)).toThrow();
  });

  it("refuses a high attestation for a thinking-off presentation request", async () => {
    const client = new AttestedPresentationRuntimeClient();
    const original = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      const result = await original(command);
      return { ...result, executionAttestation: { ...result.executionAttestation!, reasoningEffort: "high" } };
    });
    await expect(new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build([fixtureInput()])).rejects.toThrow("execution attestation is invalid");
  });

  it("attests ordered MiMo stories independently without concurrent provider tasks", async () => {
    const client = new AttestedPresentationRuntimeClient();
    let active = 0;
    let peak = 0;
    const run = client.runTask.bind(client);
    jest.spyOn(client, "runTask").mockImplementation(async command => {
      active += 1;
      peak = Math.max(peak, active);
      try {
        await Promise.resolve();
        return await run(command);
      } finally {
        active -= 1;
      }
    });
    const inputs = Array.from({ length: 4 }, (_, i) => ({ ...fixtureInput(),
      candidateId: `00000000-0000-4000-8000-00000000000${i + 4}` }));
    const results = await new AgentRuntimePromotionPresentationV3Builder({ client,
      modelBackend: "xiaomi-mimo-token-plan" }).build(inputs);
    expect(results.map(result => result.status)).toEqual(Array(4).fill("available"));
    expect(peak).toBe(1);
    expect(client.commands.map(command => JSON.parse(command.prompt).candidates
      .map((row: { candidateId: string }) => row.candidateId)))
      .toEqual(inputs.map(input => [input.candidateId]));
    expect(new Set(client.commands.map(command => command.requestId)).size).toBe(4);
  });

  it.each([[240_000, 60_000], [1_234, 1_234]])(
    "bounds each independent MiMo task configured at %i ms to %i ms", async (timeoutMs, expected) => {
      const client = new AttestedPresentationRuntimeClient();
      await new AgentRuntimePromotionPresentationV3Builder({ client,
        modelBackend: "xiaomi-mimo-token-plan", timeoutMs }).build([fixtureInput()]);
      expect(client.commands[0]?.timeoutMs).toBe(expected);
    });

  it("preserves non-MiMo configured timeouts", async () => {
    const client = new PresentationRuntimeClient();
    await new AgentRuntimePromotionPresentationV3Builder({ client, timeoutMs: 240_000 })
      .build([fixtureInput()]);
    expect(client.commands[0]?.timeoutMs).toBe(240_000);
  });

  it("rejects a conflicting presentation model under MiMo", () => {
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan",
      AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MODEL: "gpt-5.6-sol",
    }, new PresentationRuntimeClient())).toThrow("conflicts with purpose policy");
  });

  it("fails closed for an unsupported runtime provider configuration", () => {
    expect(() => resolveAgentRuntimePromotionPresentationV3BuilderOptions({
      AGENT_RUNTIME_PROVIDER: "openai",
    }, new PresentationRuntimeClient())).toThrow();
  });

  it("keeps exact retries idempotent but isolates changed batches and source revisions", async () => {
    const client = new PresentationRuntimeClient();
    const builder = new AgentRuntimePromotionPresentationV3Builder({ client });
    const first = fixtureInput();
    const second = { ...fixtureInput(), candidateId: "00000000-0000-4000-8000-000000000007" };

    await builder.build([first]);
    await builder.build([first]);
    await builder.build([first, second]);
    await builder.build([{ ...first, sourceSnapshotSha256: "2".repeat(64) }]);

    expect(client.commands[0]?.requestId).toBe(client.commands[1]?.requestId);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[2]?.requestId);
    expect(client.commands[0]?.requestId).not.toBe(client.commands[3]?.requestId);
    expect(client.commands[0]?.correlationId).not.toBe(client.commands[2]?.correlationId);
    expect(client.commands.every((command) => !command.requestId.includes(first.trustedIntent)))
      .toBe(true);
  });
});

class PresentationRuntimeClient implements AgentRuntimeClientPort {
  readonly commands: AgentRuntimeTaskCommand[] = [];

  async runTask(command: AgentRuntimeTaskCommand): Promise<AgentRuntimeTaskResult> {
    this.commands.push(command);
    const parsed = JSON.parse(command.prompt) as { candidates: { candidateId: string }[] };
    return {
      status: "completed" as const,
      structuredOutput: { presentations: parsed.candidates.map(({ candidateId }) => ({
        candidateId,
        status: "available",
        kind: "claim",
        text: "Useful database method",
        support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Useful " }],
        qualifications: [],
        confidence: 0.9,
        qualificationJudgment: "none",
      })) },
      warnings: [],
    };
  }

  async checkHealth() {
    return { status: "serving" as const, runtimeEngine: "test",
      runtimeVersion: "test", warnings: [] };
  }
}

class AttestedPresentationRuntimeClient extends PresentationRuntimeClient {
  override async runTask(command: AgentRuntimeTaskCommand) {
    const result = await super.runTask(command);
    if (command.controls?.modelBackend === "xiaomi-mimo-token-plan") {
      const value = result.structuredOutput as { presentations: Record<string, unknown>[] };
      return withTestExecutionAttestation(command, { ...result, structuredOutput: {
        contractVersion: "mimo_qualified_headline.v1", presentations:
        value.presentations.map(row => {
          const { text, ...fields } = row;
          delete fields.qualificationJudgment;
          return { ...fields, baseHeadline: text, support: [
            { field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." },
          ] };
        }) } });
    }
    return withTestExecutionAttestation(command, result);
  }
}

const fixtureInput = () => ({
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
