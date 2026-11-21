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
  reasoningEffort: "high",
});
const policy: GatewayLlmClientOptions["policy"] = Object.freeze({
  subjectRef: "fixture-subject", policyRevision: 1, bindingRevision: 1,
});
const command = (purpose: string, maxOutputTokens: number) => Object.freeze({
  purpose, controls: Object.freeze({ maxOutputTokens }),
  systemPrompt: "Strict fixture instructions", prompt: "Fixture input", timeoutMs: 60000,
}) as AgentRuntimeTaskCommand;

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
    const textOnly: GatewayLlmPreparedOutput = Object.freeze({
      structured: false, output: { mode: "text" }, outputViolations: () => undefined,
    });
    const plainRoute = Object.freeze({ ...route, reasoningEffort: undefined });
    const input = command(activeReaderSummaryPurposes.topicLabel, 40000);
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
  });
});
