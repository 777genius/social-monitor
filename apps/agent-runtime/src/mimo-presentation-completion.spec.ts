import { AgentRuntimePromotionPresentationV3Builder } from "@social-monitor/summary/adapters/model/agent-runtime-promotion-presentation-v3.builder";
import { withTestExecutionAttestation } from "@social-monitor/summary/adapters/model/reader-summary-execution-attestation.spec-support";
import type { AgentRuntimeTaskCommand } from "@social-monitor/summary/ports";
import { readerPostPresentationCandidates, mimoQualifiedHeadlineOutputSchema } from "@social-monitor/summary/domain";
import { createMimoPresentationCompletionValidator } from "./mimo-presentation-completion";

const prompt = JSON.stringify({ candidates: [{ candidateId: "original", title: "Useful database method",
  sourceText: "Useful body source." }] });
const input = () => ({ purpose: "social_monitor.reader_summary.promotion_presentation.v3",
  provider: "codex", model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "none",
  task: { prompt, outputSchemaName: "social_monitor_reader_post_presentation_v3",
    controls: { model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "none",
      schemaVersion: "reader_post_presentation.v3", outputSchemaName: "social_monitor_reader_post_presentation_v3",
      outputSchema: mimoQualifiedHeadlineOutputSchema(readerPostPresentationCandidates(prompt)) } } });

describe("source-owned MiMo presentation completion", () => {
  it("uses the same versioned composition in runtime acceptance and the builder's sealed headline", async () => {
    const wire = { contractVersion: "mimo_qualified_headline.v1", presentations: [{
      candidateId: "original", status: "available", kind: "claim", baseHeadline: "Useful database method",
      support: [{ field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." }],
      qualifications: [{ phrase: "source", evidence: [{ field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." }] }],
      confidence: 0.9,
    }] };
    const client = { runTask: async (command: AgentRuntimeTaskCommand) => {
      const validate = createMimoPresentationCompletionValidator({ ...input(), task: {
        prompt: command.prompt, outputSchemaName: command.controls.outputSchemaName,
        controls: { ...command.controls, outputSchema: command.outputSchema },
      } });
      expect(validate(wire)).toBe(true);
      return withTestExecutionAttestation(command, { status: "completed", structuredOutput: wire, warnings: [] });
    }, checkHealth: async () => ({ status: "serving" as const, runtimeEngine: "test", runtimeVersion: "test", warnings: [] }) };
    const result = await new AgentRuntimePromotionPresentationV3Builder({ client, modelBackend: "xiaomi-mimo-token-plan" }).build([{
      tenantId: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002",
      interestId: "00000000-0000-4000-8000-000000000003", candidateId: "original",
      sourceItemId: "00000000-0000-4000-8000-000000000005", sourceBindingId: "00000000-0000-4000-8000-000000000006",
      providerKey: "rss", trustedIntent: "synthetic interest", sourceSnapshotSha256: "1".repeat(64),
      title: "Useful database method", body: "Useful body source.", captureComplete: true,
    }]);
    expect(result[0]).toMatchObject({ status: "available", seal: { headline: {
      text: "Useful database method (source)", wholeInput: { qualificationJudgment: "preserved" },
    } } });
    expect(wire.presentations[0]).not.toHaveProperty("text");
  });

  it("accepts only a fully grounded proposal for the original candidate", () => {
    const source = input();
    const validate = createMimoPresentationCompletionValidator(source);
    source.task.prompt = JSON.stringify({ candidates: [{ candidateId: "substituted", title: "Changed", sourceText: "Changed" }] });
    const output = { contractVersion: "mimo_qualified_headline.v1", presentations: [{ candidateId: "original", status: "available", kind: "claim",
      baseHeadline: "Useful database method", support: [{ field: "bodyPreview", start: 0, end: 19, quote: "Useful body source." }],
      qualifications: [], confidence: 0.9 }] };
    expect(validate(output)).toBe(true);
    expect(validate({ contractVersion: "mimo_qualified_headline.v1", presentations: [{ ...output.presentations[0], candidateId: "substituted" }] })).toBe(false);
    expect(validate({ contractVersion: "mimo_qualified_headline.v1", presentations: [{ ...output.presentations[0], support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Changed" }] }] })).toBe(false);
  });

  it("distinguishes pre-callback schema rejection from product rejection without source or output bytes", () => {
    const validate = createMimoPresentationCompletionValidator(input());
    const failure = { failureDetails: { rawCause: "codex_goal_completed_output_rejected" },
      output: "PRIVATE_SOURCE_OUTPUT", token: "PRIVATE_CREDENTIAL" };
    expect(validate.failureDetails(failure)).toEqual({
      presentationValidationStage: "schema_parse_or_normalization",
      presentationOutputValidatorCalled: "false", presentationOutputValidatorAccepted: "not_returned",
    });
    expect(validate({ contractVersion: "mimo_qualified_headline.v1", presentations: [] })).toBe(false);
    expect(validate.failureDetails(failure)).toEqual({
      presentationValidationStage: "product_contract_rejected",
      presentationOutputValidatorCalled: "true", presentationOutputValidatorAccepted: "false",
      presentationRejectedPredicate: "proposal_cardinality",
    });
    expect(JSON.stringify(validate.failureDetails(failure))).not.toMatch(/PRIVATE_SOURCE_OUTPUT|PRIVATE_CREDENTIAL/);
    expect(validate.failureDetails({ failureDetails: { rawCause: "codex_goal_completion_status_changed" } })).toEqual({});
  });

  it("preserves strict source rejection while retaining only its predicate and candidate index", () => {
    const validate = createMimoPresentationCompletionValidator(input());
    const output = { contractVersion: "mimo_qualified_headline.v1", presentations: [{ candidateId: "original", status: "available", kind: "claim",
      baseHeadline: "Useful database method", support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Changed" }],
      qualifications: [], confidence: 0.9 }] };
    expect(validate(output)).toBe(false);
    expect(validate.failureDetails({ failureDetails: { rawCause: "codex_goal_completed_output_rejected" } })).toEqual({
      presentationValidationStage: "product_contract_rejected", presentationOutputValidatorCalled: "true",
      presentationOutputValidatorAccepted: "false", presentationRejectedPredicate: "source_reference",
      presentationRejectedCandidateIndex: "0",
    });
  });

  it("preserves only finite SDK parse diagnostics even without the Goal rejection marker", () => {
    const validate = createMimoPresentationCompletionValidator(input());
    expect(validate.failureDetails({ failureDetails: { outputValidationStage: "schema_normalization",
      outputValidationCode: "schema_normalization_failed", outputValidationKeyword: "maxLength",
      rawCause: "PRIVATE_SOURCE", presentationOutputValidatorCalled: "true", output: "PRIVATE_OUTPUT" } }))
      .toEqual({ outputValidationStage: "schema_normalization", outputValidationCode: "schema_normalization_failed",
        outputValidationKeyword: "maxLength" });
    expect(validate.failureDetails({ details: { outputValidationStage: "PRIVATE_CREDENTIAL",
      outputValidationCode: "arbitrary", rawCause: "network_error" } })).toEqual({});
    expect(validate.failureDetails({ failureDetails: { rawCause: "network_error" }, details: {
      outputValidationStage: "schema_normalization", outputValidationCode: "schema_normalization_failed",
      outputValidationKeyword: "maxLength", output: "PRIVATE_OUTPUT" } })).toEqual({
      outputValidationStage: "schema_normalization", outputValidationCode: "schema_normalization_failed",
      outputValidationKeyword: "maxLength" });
  });

  it.each([
    { purpose: "social_monitor.reader_summary.generate.v2" },
    { provider: "claude" }, { model: "gpt-5.6-sol" }, { modelBackend: "openai-chatgpt" },
    { reasoningEffort: "high" },
  ])("refuses another purpose or execution profile", override => {
    expect(() => createMimoPresentationCompletionValidator({ ...input(), ...override })).toThrow();
  });

  it("requires the complete source-registered schema and matching controls", () => {
    const source = input();
    for (const controls of [
      { ...source.task.controls, reasoningEffort: "high" },
      { ...source.task.controls, schemaVersion: "other" },
      { ...source.task.controls, outputSchema: { type: "object", required: ["presentations"] } },
    ]) expect(() => createMimoPresentationCompletionValidator({ ...source, task: { ...source.task, controls } })).toThrow();
  });
});
