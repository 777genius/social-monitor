import {
  readerSummaryRouteControls,
  resolveReaderSummaryBackendEffort,
} from "./reader-summary-generation-effort-policy";
import {
  readerSummaryRouteControls as legacyRouteControls,
  resolveReaderSummaryBackendEffort as legacyBackendEffort,
} from "./active-reader-summary-generation-profile";

describe("reader summary backend effort admission", () => {
  it("keeps historical exports as the exact same functions", () => {
    expect(legacyRouteControls).toBe(readerSummaryRouteControls);
    expect(legacyBackendEffort).toBe(resolveReaderSummaryBackendEffort);
  });

  it("omits the default gateway reasoning control without dropping its backend", () => {
    expect(readerSummaryRouteControls("kimi-code", "default")).toEqual({
      modelBackend: "kimi-code",
    });
    expect(readerSummaryRouteControls("openrouter", "ultra")).toEqual({
      modelBackend: "openrouter",
      reasoningEffort: "ultra",
    });
    expect(readerSummaryRouteControls("openai-chatgpt", "high")).toEqual({
      reasoningEffort: "high",
    });
  });

  it("admits gateway defaults and explicit allowlisted reasoning, rejecting unknown efforts", () => {
    expect(resolveReaderSummaryBackendEffort(
      "kimi-code", undefined, "high", "k3-256k",
    )).toBe("default");
    expect(resolveReaderSummaryBackendEffort(
      "openrouter", "max", "high", "openai/gpt-oss-120b",
    )).toBe("max");
    expect(() => resolveReaderSummaryBackendEffort(
      "openrouter", "invented", "high", "openai/gpt-oss-120b",
    )).toThrow("Reader summary execution profile and effort conflict");
  });

  it("pins Codex gateway-only models to an admitted model-effort pair", () => {
    expect(resolveReaderSummaryBackendEffort(
      "openai-chatgpt", undefined, "high", "gpt-6.1-sol",
    )).toBe("low");
    expect(() => resolveReaderSummaryBackendEffort(
      "openai-chatgpt", "high", "high", "gpt-6.1-sol",
    )).toThrow("Reader summary execution profile and effort conflict");
  });

  it("preserves the CLI effort pin for canonical Codex and MiMo", () => {
    expect(resolveReaderSummaryBackendEffort(
      "openai-chatgpt", undefined, "high", "gpt-5.6-sol",
    )).toBe("high");
    expect(resolveReaderSummaryBackendEffort(
      "xiaomi-mimo-token-plan", "high", "high", "mimo-v2.6-pro",
    )).toBe("high");
    expect(() => resolveReaderSummaryBackendEffort(
      "xiaomi-mimo-token-plan", "low", "high", "mimo-v2.6-pro",
    )).toThrow("Reader summary execution profile and effort conflict");
  });
});
