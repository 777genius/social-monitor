import { readerPostPresentationV3OutputSchema } from "@social-monitor/summary/domain";
import { createMimoPresentationCompletionValidator } from "./mimo-presentation-completion";

const input = () => ({ purpose: "social_monitor.reader_summary.promotion_presentation.v3",
  provider: "codex", model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "none",
  task: { prompt: JSON.stringify({ candidates: [{ candidateId: "original", title: "Useful database method",
    sourceText: "Useful body source." }] }), outputSchemaName: "social_monitor_reader_post_presentation_v3",
    controls: { model: "mimo-v2.6-pro", modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "none",
      schemaVersion: "reader_post_presentation.v3", outputSchemaName: "social_monitor_reader_post_presentation_v3",
      outputSchema: readerPostPresentationV3OutputSchema } } });

describe("source-owned MiMo presentation completion", () => {
  it("accepts only a fully grounded proposal for the original candidate", () => {
    const source = input();
    const validate = createMimoPresentationCompletionValidator(source);
    source.task.prompt = JSON.stringify({ candidates: [{ candidateId: "substituted", title: "Changed", sourceText: "Changed" }] });
    const output = { presentations: [{ candidateId: "original", status: "available", kind: "claim",
      text: "Useful database method", support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Useful " }],
      qualifications: [], confidence: 0.9, qualificationJudgment: "none" }] };
    expect(validate(output)).toBe(true);
    expect(validate({ presentations: [{ ...output.presentations[0], candidateId: "substituted" }] })).toBe(false);
    expect(validate({ presentations: [{ ...output.presentations[0], support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Changed" }] }] })).toBe(false);
  });

  it("distinguishes pre-callback schema rejection from product rejection without source or output bytes", () => {
    const validate = createMimoPresentationCompletionValidator(input());
    const failure = { failureDetails: { rawCause: "codex_goal_completed_output_rejected" },
      output: "PRIVATE_SOURCE_OUTPUT", token: "PRIVATE_CREDENTIAL" };
    expect(validate.failureDetails(failure)).toEqual({
      presentationValidationStage: "schema_parse_or_normalization",
      presentationOutputValidatorCalled: "false", presentationOutputValidatorAccepted: "not_returned",
    });
    expect(validate({ presentations: [] })).toBe(false);
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
    const output = { presentations: [{ candidateId: "original", status: "available", kind: "claim",
      text: "Useful database method", support: [{ field: "bodyPreview", start: 0, end: 7, quote: "Changed" }],
      qualifications: [], confidence: 0.9, qualificationJudgment: "none" }] };
    expect(validate(output)).toBe(false);
    expect(validate.failureDetails({ failureDetails: { rawCause: "codex_goal_completed_output_rejected" } })).toEqual({
      presentationValidationStage: "product_contract_rejected", presentationOutputValidatorCalled: "true",
      presentationOutputValidatorAccepted: "false", presentationRejectedPredicate: "source_reference",
      presentationRejectedCandidateIndex: "0",
    });
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
