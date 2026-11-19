import type { AgentRuntimeClientPort } from "../../ports";
import {
  mimoPresentationMaxTimeoutMs,
  mimoReaderSummaryBackend,
} from "./reader-summary-runtime-contract";
import { codexReaderSummaryBackend } from "./codex-reader-summary-gateway-route-policy";
import {
  kimiCodeReaderSummaryBackend,
  openRouterReaderSummaryBackend,
} from "./reader-summary-gateway-model-policy";
import { usesSourceCopyOptions } from "./agent-runtime-promotion-presentation-v3-request";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultPresentationTimeoutMs,
  resolvePromotionPresentationV3RuntimeOptions,
} from "./agent-runtime-promotion-presentation-v3-options";

const client = { runTask: jest.fn() } as unknown as AgentRuntimeClientPort;

describe("promotion presentation runtime options", () => {
  it("keeps default timeout/token budget and the injected client without dispatch", () => {
    const options = resolvePromotionPresentationV3RuntimeOptions({ client });
    expect(options.client).toBe(client);
    expect(options.timeoutMs).toBe(defaultPresentationTimeoutMs);
    expect(options.maxOutputTokens).toBe(2_400);
    expect(client.runTask).not.toHaveBeenCalled();
  });

  it("caps only MiMo presentation deadlines without changing provider dispatch", () => {
    const options = resolvePromotionPresentationV3RuntimeOptions({
      client, modelBackend: "xiaomi-mimo-token-plan", timeoutMs: 99_000_000,
    });
    expect(options.timeoutMs).toBe(mimoPresentationMaxTimeoutMs);
    expect(options.client).toBe(client);
    expect(client.runTask).not.toHaveBeenCalled();
  });

  it("rejects conflicting CLI effort before a task is dispatched", () => {
    expect(() => resolvePromotionPresentationV3RuntimeOptions({
      client, modelBackend: "xiaomi-mimo-token-plan", reasoningEffort: "high",
    })).toThrow("Presentation reasoning effort conflicts with purpose policy");
    expect(client.runTask).not.toHaveBeenCalled();
  });
  it("keeps source-copy admission identical across MiMo, gateway and Codex backends", () => {
    expect(usesSourceCopyOptions(mimoReaderSummaryBackend)).toBe(true);
    expect(usesSourceCopyOptions(kimiCodeReaderSummaryBackend)).toBe(true);
    expect(usesSourceCopyOptions(openRouterReaderSummaryBackend)).toBe(true);
    expect(usesSourceCopyOptions(codexReaderSummaryBackend)).toBe(false);
    expect(client.runTask).not.toHaveBeenCalled();
  });

  it("prevents presentation transport and composition from importing the broad generation facade", () => {
    for (const name of [
      "agent-runtime-promotion-presentation-v3-options.ts",
      "agent-runtime-promotion-presentation-v3-request.ts",
      "agent-runtime-promotion-presentation-v3.builder.ts",
    ]) {
      const source = readFileSync(join(__dirname, name), "utf8");
      expect(source).not.toContain('from "./active-reader-summary-generation-profile"');
      expect(source).not.toContain("from './active-reader-summary-generation-profile'");
    }
  });
});
