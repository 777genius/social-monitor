import type { AgentRuntimeClientPort } from "../../ports";
import { mimoPresentationMaxTimeoutMs } from "./active-reader-summary-generation-profile";
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
});
