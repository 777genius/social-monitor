import { tenantId, workspaceId } from "@social-monitor/shared-kernel";
import type { AgentRuntimeTaskCommand } from "../../../ports";
import { activeReaderSummaryPurposes } from "../reader-summary-runtime-contract";
import type { GatewayLlmClientOptions, GatewayLlmRoute } from "./gateway-llm-client-contract";
import { gatewayLlmSdkTaskPayload } from "./gateway-llm-sdk-task-payload";
import type { GatewayLlmPreparedOutput } from "./gateway-llm-structured-output";

const route: GatewayLlmRoute = Object.freeze({
  profileId: "fixture-gateway-profile",
  modelBackend: "kimi-code",
  model: "fixture-kimi",
  accountRefs: Object.freeze(["fixture-account"]),
  minOutputTokens: 32768,
  reasoningEffort: "high" as const,
});
const policy: GatewayLlmClientOptions["policy"] = Object.freeze({
  subjectRef: "fixture-subject", policyRevision: 1, bindingRevision: 1,
});
const command = (
  purpose: string, maxOutputTokens: number, selectedRoute: GatewayLlmRoute = route,
): AgentRuntimeTaskCommand => Object.freeze({
  requestId: "fixture-request",
  tenantId: tenantId("00000000-0000-7000-8000-000000000901"),
  workspaceId: workspaceId("00000000-0000-7000-8000-000000000902"),
  correlationId: "fixture-correlation", provider: "codex", purpose,
  controls: Object.freeze({
    model: selectedRoute.model, modelBackend: selectedRoute.modelBackend,
    ...(selectedRoute.reasoningEffort === undefined ? {} :
      { reasoningEffort: selectedRoute.reasoningEffort }),
    maxOutputTokens,
  }),
  systemPrompt: "Strict fixture instructions", prompt: "Fixture input",
  outputSchema: {}, timeoutMs: 60000,
});

describe("gateway SDK task projection after trusted admission", () => {
  it("keeps exact SDK field order, output references, effort, floor and deadline", () => {
    const decode: NonNullable<GatewayLlmPreparedOutput["decode"]> = (value) =>
      value as Record<string, unknown>;
    const output: GatewayLlmPreparedOutput["output"] = { mode: "text" };
    const preparedOutput: GatewayLlmPreparedOutput = Object.freeze({
      structured: false, output, decode, outputViolations: () => undefined,
    });
    const input = command(activeReaderSummaryPurposes.generate, 6000);
    const task = gatewayLlmSdkTaskPayload(input, 1000, route, policy, preparedOutput);
    expect(Object.keys(task)).toEqual([
      "profileId", "model", "policy", "instructions", "input", "output", "effort",
      "maxOutputTokens", "limits", "deadline", "decode",
    ]);
    expect(task).toMatchObject({
      profileId: "fixture-gateway-profile", model: "fixture-kimi",
      policy, instructions: input.systemPrompt, input: input.prompt,
      effort: "high", maxOutputTokens: 32768, limits: { outputBytes: expect.any(Number) },
    });
    expect(task.deadline.getTime()).toBe(91000);
    expect(task.output).toBe(output);
    expect(task.decode).toBe(decode);
    expect(input.controls.maxOutputTokens).toBe(6000);
    expect(route.minOutputTokens).toBe(32768);
  });

  it("omits optional effort/decode without changing output or inputs", () => {
    const output: GatewayLlmPreparedOutput["output"] = Object.freeze({ mode: "text" });
    const textOnly: GatewayLlmPreparedOutput = Object.freeze({
      structured: false, output, outputViolations: () => undefined,
    });
    const plainRoute: GatewayLlmRoute = Object.freeze({
      profileId: route.profileId, modelBackend: route.modelBackend, model: route.model,
      accountRefs: route.accountRefs, minOutputTokens: route.minOutputTokens,
    });
    const input = command(activeReaderSummaryPurposes.topicLabel, 40000, plainRoute);
    const first = gatewayLlmSdkTaskPayload(input, 0, plainRoute, policy, textOnly);
    const second = gatewayLlmSdkTaskPayload(input, 0, plainRoute, policy, textOnly);
    expect(Object.keys(first)).toEqual([
      "profileId", "model", "policy", "instructions", "input", "output",
      "maxOutputTokens", "limits", "deadline",
    ]);
    expect(first.maxOutputTokens).toBe(40000);
    expect(first.deadline.getTime()).toBe(second.deadline.getTime());
    expect(first.output).toBe(textOnly.output);
    expect(first.policy).toBe(policy);
    expect(plainRoute.reasoningEffort).toBeUndefined();
    expect(input.controls.reasoningEffort).toBeUndefined();
  });
});
