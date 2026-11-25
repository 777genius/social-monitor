import {
  codexReaderSummaryBackend,
  mimoReaderSummaryBackend,
  openRouterReaderSummaryBackend,
} from "./active-reader-summary-generation-profile";
import { readerSummaryTaskControls } from "./agent-runtime-reader-summary-command-controls";

const base = Object.freeze({
  selectedRoute: Object.freeze({
    provider: "agent-runtime",
    model: "codex:gpt-5.6-sol:high",
    promptVersion: "reader_summary.prompt.test",
    schemaVersion: "reader_summary.artifact.v1",
  } as const),
  modelBackend: codexReaderSummaryBackend,
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  maxOutputTokens: 16_000,
});

describe("Agent Runtime reader-summary execution controls", () => {
  it("preserves the strict CLI keys, order, model, schema and no-tools policy", () => {
    const controls = readerSummaryTaskControls(base);
    expect(Object.keys(controls)).toEqual([
      "interactive", "outputSchemaName", "schemaVersion", "model",
      "reasoningEffort", "toolsEnabled", "toolPolicy", "maxOutputTokens",
    ]);
    expect(controls).toEqual({
      interactive: false,
      outputSchemaName: "social_monitor_reader_summary_artifact",
      schemaVersion: "reader_summary.artifact.v1",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      toolsEnabled: false,
      toolPolicy: "none",
      maxOutputTokens: 16_000,
    });
    expect(readerSummaryTaskControls(base)).toEqual(controls);
    expect(base.selectedRoute.schemaVersion).toBe("reader_summary.artifact.v1");
  });

  it("preserves explicit MiMo and gateway backends without tools", () => {
    const mimo = readerSummaryTaskControls({
      ...base, modelBackend: mimoReaderSummaryBackend, model: "mimo-v2.6-pro",
      reasoningEffort: "none",
    });
    const gateway = readerSummaryTaskControls({
      ...base, modelBackend: openRouterReaderSummaryBackend,
      model: "openrouter/model", reasoningEffort: "high",
    });
    expect(mimo).toMatchObject({
      model: "mimo-v2.6-pro", modelBackend: mimoReaderSummaryBackend,
      toolsEnabled: false, toolPolicy: "none", maxOutputTokens: 16_000,
    });
    expect(gateway).toMatchObject({
      model: "openrouter/model", modelBackend: openRouterReaderSummaryBackend,
      toolsEnabled: false, toolPolicy: "none", maxOutputTokens: 16_000,
    });
    expect(base.model).toBe("gpt-5.6-sol");
    expect(base.modelBackend).toBe(codexReaderSummaryBackend);
  });
});
