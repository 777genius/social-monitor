import type { AgentRuntimeTaskCommand } from "../../../ports";
import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import { codexReaderSummaryBackend } from "../active-reader-summary-generation-profile";
import type { GatewayLlmRoute } from "./gateway-llm-client";
import { prepareGatewayLlmTask } from "./gateway-llm-task-preparation";
import { admitGatewayLlmTaskRoute } from "./gateway-llm-task-route-admission";

const route: GatewayLlmRoute = {
  profileId: "fixture-gateway", modelBackend: "kimi-code", model: "fixture-model",
  accountRefs: [], minOutputTokens: 1024,
};
const command = (
  controls: Partial<AgentRuntimeTaskCommand["controls"]> = {},
  fields: Partial<Pick<AgentRuntimeTaskCommand, "systemPrompt" | "timeoutMs">> = {},
): AgentRuntimeTaskCommand => ({
  requestId: "fixture-gateway-route-request",
  tenantId: tenantId("00000000-0000-7000-8000-000000000a01"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000a02"),
  correlationId: "fixture-gateway-route-correlation",
  provider: "codex",
  purpose: "social_monitor.reader_summary.topic_map.label.v2",
  controls: { model: route.model, modelBackend: route.modelBackend, ...controls },
  systemPrompt: "Explain only the fixture evidence", prompt: "fixture",
  outputSchema: {}, timeoutMs: 1000, ...fields,
});

describe("gateway LLM task route admission", () => {
  it("accepts exact configured inputs without mutation", () => {
    const task = Object.freeze(command());
    const settings = Object.freeze({ ...route });
    expect(admitGatewayLlmTaskRoute(task, settings)).toBeNull();
    expect(task.controls.model).toBe(route.model);
    expect(settings).toEqual(route);
  });
  it("rejects unconfigured model/backend before output schema processing", () => {
    for (const controls of [{ model: "forged" }, { modelBackend: "codex" },
      { modelBackend: undefined }]) {
      const task = command(controls);
      const expected = admitGatewayLlmTaskRoute(task, route);
      expect(expected).toMatchObject({ failure: { code: "unsupported_route",
        details: { gatewayEffect: "not_dispatched" } } });
      expect(prepareGatewayLlmTask(
        { ...task, outputSchema: undefined } as unknown as AgentRuntimeTaskCommand,
        0, { route, policy: {} as Parameters<typeof prepareGatewayLlmTask>[2]["policy"] },
      )).toEqual(expected);
    }
  });
  it("requires exact effort including presence and preserves failure precedence", () => {
    const high = { ...route, reasoningEffort: "high" as const };
    expect(admitGatewayLlmTaskRoute(command({ reasoningEffort: "high" }), high)).toBeNull();
    expect(admitGatewayLlmTaskRoute(command(), high))
      .toMatchObject({ failure: { code: "invalid_request" } });
    expect(admitGatewayLlmTaskRoute(command({ reasoningEffort: "high" }), route))
      .toMatchObject({ failure: { code: "invalid_request" } });
    expect(admitGatewayLlmTaskRoute(command({ model: "wrong", reasoningEffort: "high" },
      { systemPrompt: "", timeoutMs: 0 }), route))
      .toMatchObject({ failure: { code: "unsupported_route" } });
  });
  it("denies blank instructions and invalid deadlines without dispatch", () => {
    for (const fields of [
      { systemPrompt: " \t " }, { timeoutMs: 0 },
      { timeoutMs: -1 }, { timeoutMs: Number.NaN },
      { timeoutMs: Number.POSITIVE_INFINITY },
      { timeoutMs: 1.5 }, { timeoutMs: Number.MAX_SAFE_INTEGER + 1 },
    ]) expect(admitGatewayLlmTaskRoute(command({}, fields), route))
      .toMatchObject({ failure: { code: "invalid_request" } });
    expect(admitGatewayLlmTaskRoute(command({}, { timeoutMs: 1 }), route)).toBeNull();
  });
  it("permits implicit modelBackend only on the exact Codex route", () => {
    const codex = { ...route, modelBackend: codexReaderSummaryBackend };
    expect(admitGatewayLlmTaskRoute(command({ modelBackend: undefined }), codex)).toBeNull();
    expect(admitGatewayLlmTaskRoute(command({ modelBackend: "kimi-code" }), codex))
      .toMatchObject({ failure: { code: "unsupported_route" } });
  });
});
