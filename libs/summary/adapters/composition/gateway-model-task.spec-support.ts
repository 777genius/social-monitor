import { createLlmClient, type ExecutionPort } from "@agent-teams/account-gateway/llm";
import { GatewayLlmClient, type GatewayLlmRoute } from "../model/gateway-llm/gateway-llm-client";
import { RunScopedGatewayLlmAttempts } from "../model/gateway-llm/gateway-llm-attempts";
import { CooldownRotatingAccountSelector } from "../model/gateway-llm/gateway-llm-account-selector";
import { approvedGatewayLlmSdkIdentity } from "../model/gateway-llm/gateway-llm-sdk-identity";

/** Exercises the actual SDK request/response contract with isolated in-memory I/O. */
export const gatewayModelTaskFixture = (route: GatewayLlmRoute, output: Record<string, unknown>) => {
  const bodies: Record<string, unknown>[] = [];
  const clock = { now: () => new Date("2026-10-30T00:00:00.000Z") };
  const execution: ExecutionPort = {
    request: async (_ref, input) => {
      bodies.push(JSON.parse(new TextDecoder().decode(input.body)) as Record<string, unknown>);
      const bytes = new TextEncoder().encode(`data: ${JSON.stringify({ type: "response.completed",
        response: { id: "synthetic-response", model: route.model, status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
          usage: { input_tokens: 40, output_tokens: 9 } } })}\n\n`);
      return { kind: "stream", requestRef: "synthetic-request", body: new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(bytes); controller.close(); },
      }), cancel: async () => {} };
    },
    status: async () => { throw new Error("No status reconciliation expected"); },
    close: async (_ref, input) => ({ operationRef: input.operationId, state: "applied" }),
  };
  const llm = createLlmClient({ now: () => clock.now().getTime(),
    control: { runAccess: async (intent) => ({
      operation: { operationRef: intent.operationId, state: "applied", result: {
        kind: "execution", executionRef: "synthetic-execution", accountRef: intent.accountRefs[0]!,
        authorizationEpoch: 3, deadline: intent.deadline, state: "active" } },
      bearer: "synthetic-bearer",
      admission: { invocationRef: intent.invocationRef, attemptRef: intent.attemptRef,
        accountRef: intent.accountRefs[0]!, authorizationEpoch: 3, subjectRef: intent.subjectRef,
        policyRevision: intent.policyRevision, bindingRevision: intent.bindingRevision,
        profileId: intent.profileId, limits: intent.limits, expiresAt: intent.deadline },
    }) }, connectExecution: () => execution });
  return { bodies, client: new GatewayLlmClient({ llm, route, clock,
    policy: { subjectRef: "synthetic-social-monitor", policyRevision: 1, bindingRevision: 0 },
    attempts: new RunScopedGatewayLlmAttempts("synthetic-route-regression"),
    accounts: new CooldownRotatingAccountSelector({ busyCooldownMs: 30_000, unauthorizedCooldownMs: 30_000 }),
    sdk: approvedGatewayLlmSdkIdentity, sleep: async () => {},
  }) };
};
