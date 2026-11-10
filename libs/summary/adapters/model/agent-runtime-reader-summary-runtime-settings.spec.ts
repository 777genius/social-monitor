import type { AgentRuntimeClientPort } from "../../ports";
import { frozenLegacyReaderSummaryRecoveryContract } from "./active-reader-summary-generation-profile";
import { defaultTimeoutMs as adapterDefaultTimeoutMs } from "./agent-runtime-reader-summary-model.adapter";
import {
  defaultTimeoutMs,
  resolveAgentRuntimeReaderSummaryRuntimeSettings,
} from "./agent-runtime-reader-summary-runtime-settings";

const client = {} as AgentRuntimeClientPort;

describe("agent runtime reader summary runtime settings", () => {
  it("preserves production route identity, effort and dispatch defaults", () => {
    expect(adapterDefaultTimeoutMs).toBe(defaultTimeoutMs);
    expect(resolveAgentRuntimeReaderSummaryRuntimeSettings({ client })).toEqual({
      agentProvider: "codex",
      providerInstanceId: undefined,
      model: "gpt-5.6-sol",
      modelBackend: "openai-chatgpt",
      reasoningEffort: "high",
      legacyRecovery: false,
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      timeoutMs: 600_000,
      maxOutputTokens: 16_000,
      inputTokenDivisor: 4,
    });
  });

  it("keeps explicit runtime overrides separate from model execution", () => {
    expect(resolveAgentRuntimeReaderSummaryRuntimeSettings({
      client,
      providerInstanceId: "synthetic-account",
      evalDatasetVersion: " synthetic-dataset ",
      timeoutMs: 12_345,
      maxOutputTokens: 8_000,
      inputTokenDivisor: 5,
    })).toMatchObject({
      providerInstanceId: "synthetic-account",
      evalDatasetVersion: "synthetic-dataset",
      timeoutMs: 12_345,
      maxOutputTokens: 8_000,
      inputTokenDivisor: 5,
    });
  });

  it("keeps invalid numeric limits on the historic conservative defaults", () => {
    const settings = resolveAgentRuntimeReaderSummaryRuntimeSettings({
      client,
      evalDatasetVersion: "  ",
      timeoutMs: 0,
      maxOutputTokens: Number.POSITIVE_INFINITY,
      inputTokenDivisor: -4,
    });
    expect(settings).toMatchObject({
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      timeoutMs: 600_000,
      maxOutputTokens: 16_000,
      inputTokenDivisor: 4,
    });
  });

  it("keeps canonical frozen legacy recovery at xhigh and rejects copies", () => {
    expect(resolveAgentRuntimeReaderSummaryRuntimeSettings({
      client,
      legacyRecoveryContract: frozenLegacyReaderSummaryRecoveryContract,
    })).toMatchObject({ legacyRecovery: true, reasoningEffort: "xhigh" });
    expect(() => resolveAgentRuntimeReaderSummaryRuntimeSettings({
      client,
      legacyRecoveryContract: {} as typeof frozenLegacyReaderSummaryRecoveryContract,
    })).toThrow("Reader summary legacy recovery contract is not canonical");
  });

  it("fails closed on a model/backend mismatch before dispatch", () => {
    expect(() => resolveAgentRuntimeReaderSummaryRuntimeSettings({
      client,
      modelBackend: "xiaomi-mimo-token-plan",
      model: "gpt-5.6-sol",
    })).toThrow("conflicts with purpose policy");
  });
});
