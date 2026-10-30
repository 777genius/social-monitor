import { readFileSync } from "node:fs";

import { createConsumerControlClient } from "@agent-teams/account-gateway/http";
import { createLlmClient, executionConnector } from "@agent-teams/account-gateway/llm";
import type { LlmEffort, LlmPolicy } from "@agent-teams/account-gateway/llm";
import type { Clock } from "@social-monitor/shared-kernel";

import type { AgentRuntimeClientPort } from "../../ports";
import {
  gatewayDefaultReasoningEffort,
  isGatewayReaderSummaryBackend,
  resolveGatewayReaderSummaryRoute,
  type GatewayReaderSummaryBackend,
} from "../model/active-reader-summary-generation-profile";
import { CooldownRotatingAccountSelector, gatewayLlmMaxAccountRefs } from
  "../model/gateway-llm/gateway-llm-account-selector";
import { RunScopedGatewayLlmAttempts } from "../model/gateway-llm/gateway-llm-attempts";
import { GatewayLlmClient, type GatewayLlmRoute } from "../model/gateway-llm/gateway-llm-client";
import { approvedGatewayLlmSdkIdentity } from "../model/gateway-llm/gateway-llm-sdk-identity";

/** How reader-summary model tasks are executed: the CLI runtime over gRPC, or account-gateway. */
export type ReaderSummaryAgentRuntimeTransport = "agent-runtime" | "gateway-llm";

export const gatewayLlmProfileByBackend: Readonly<Record<GatewayReaderSummaryBackend, string>> =
  Object.freeze({
    "kimi-code": "kimi-code-global-responses-apikey-v1",
    openrouter: "openrouter-openai-responses-apikey-v1",
  });
/** max_output_tokens ceiling of the deployed gateway profiles. */
export const gatewayLlmProfileMaxOutputTokens = 65_536;
/** Room for always-on reasoning before the answer; 256 ended incomplete in the Kimi smoke. */
export const defaultGatewayLlmMinOutputTokens = 32_768;
const accountBusyCooldownMs = 60_000;
const accountUnauthorizedCooldownMs = 15 * 60_000;
const healthProbeTimeoutMs = 10_000;
const gatewayReference = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export type GatewayLlmTransportConfig = {
  readonly controlOrigin: string;
  readonly inferenceOrigin?: string;
  readonly controlTokenFile: string;
  readonly policy: LlmPolicy;
  readonly route: GatewayLlmRoute;
};

/**
 * Gateway transport settings. The control token is a file path so the secret
 * never enters the environment; the CA for the private origin comes from
 * NODE_EXTRA_CA_CERTS, which Node reads itself.
 */
export const resolveGatewayLlmTransportConfig = (
  env: NodeJS.ProcessEnv,
): GatewayLlmTransportConfig => {
  const route = resolveGatewayReaderSummaryRoute(env);
  if (route === undefined) {
    throw new Error("AGENT_RUNTIME_TRANSPORT=gateway-llm requires AGENT_RUNTIME_READER_SUMMARY_BACKEND=kimi-code or openrouter");
  }
  const accountRefs = [...new Set((env.AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS ?? "")
    .split(/[\s,]+/u).filter((value) => value.length > 0))];
  if (accountRefs.length === 0 || accountRefs.length > gatewayLlmMaxAccountRefs ||
    !accountRefs.every((value) => gatewayReference.test(value))) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_ACCOUNT_REFS must list 1..16 gateway account refs");
  }
  const subjectRef = required(env, "AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF");
  if (!gatewayReference.test(subjectRef)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_POLICY_SUBJECT_REF is not a gateway reference");
  }
  const inferenceOrigin = optional(env, "AGENT_RUNTIME_GATEWAY_LLM_INFERENCE_ORIGIN");
  const profileId = optional(env, "AGENT_RUNTIME_GATEWAY_LLM_PROFILE_ID") ??
    gatewayLlmProfileByBackend[route.backend];
  if (!gatewayReference.test(profileId)) {
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_PROFILE_ID is not a gateway reference");
  }
  return {
    controlOrigin: required(env, "AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN"),
    ...(inferenceOrigin === undefined ? {} : { inferenceOrigin }),
    controlTokenFile: required(env, "AGENT_RUNTIME_GATEWAY_LLM_CONTROL_TOKEN_FILE"),
    policy: {
      subjectRef,
      policyRevision: revision(env, "AGENT_RUNTIME_GATEWAY_LLM_POLICY_REVISION"),
      bindingRevision: revision(env, "AGENT_RUNTIME_GATEWAY_LLM_BINDING_REVISION"),
    },
    route: {
      profileId,
      modelBackend: route.backend,
      model: route.model,
      ...(route.reasoningEffort === gatewayDefaultReasoningEffort ? {}
        : { reasoningEffort: route.reasoningEffort as LlmEffort }),
      accountRefs,
      minOutputTokens: boundedInteger(env, "AGENT_RUNTIME_GATEWAY_LLM_MAX_OUTPUT_TOKENS",
        defaultGatewayLlmMinOutputTokens, gatewayLlmProfileMaxOutputTokens),
    },
  };
};

/**
 * Gateway-only backends never reach the CLI, and the CLI backends (Codex
 * subscription, MiMo) never reach the gateway, so a half-switched
 * configuration fails at startup instead of on the first paid task.
 */
export const assertReaderSummaryTransportBackend = (
  transport: ReaderSummaryAgentRuntimeTransport,
  env: NodeJS.ProcessEnv,
): void => {
  const gatewayBackend = isGatewayReaderSummaryBackend(
    env.AGENT_RUNTIME_READER_SUMMARY_BACKEND?.trim());
  if (gatewayBackend !== (transport === "gateway-llm")) {
    throw new Error(gatewayBackend
      ? "Gateway reader summary backends require AGENT_RUNTIME_TRANSPORT=gateway-llm"
      : "AGENT_RUNTIME_TRANSPORT=gateway-llm serves only the kimi-code and openrouter backends");
  }
};

export const createGatewayLlmAgentRuntimeClient = (
  config: GatewayLlmTransportConfig,
  deps: {
    readonly clock: Clock;
    /** Fresh per process run: gateway attempt identities are scoped to it. */
    readonly runId: string;
    readonly readControlToken?: (path: string) => string;
  },
): GatewayLlmClient => {
  const token = (deps.readControlToken ?? readTokenFile)(config.controlTokenFile).trim();
  if (token.length === 0) {
    throw new Error("Gateway control token file is empty");
  }
  let control: ReturnType<typeof createConsumerControlClient>;
  let connectExecution: ReturnType<typeof executionConnector>;
  try {
    control = createConsumerControlClient({
      role: "consumer-control", origin: config.controlOrigin, token });
    connectExecution = executionConnector({
      origin: config.controlOrigin,
      ...(config.inferenceOrigin === undefined ? {} : { inferenceOrigin: config.inferenceOrigin }),
    });
  } catch {
    // The SDK reports only invalid_input; name the settings without echoing them.
    throw new Error("AGENT_RUNTIME_GATEWAY_LLM_CONTROL_ORIGIN and _INFERENCE_ORIGIN must be bare https origins");
  }
  const llm = createLlmClient({ control, connectExecution, now: () => deps.clock.now().getTime() });
  return new GatewayLlmClient({
    llm,
    policy: config.policy,
    route: config.route,
    attempts: new RunScopedGatewayLlmAttempts(deps.runId),
    accounts: new CooldownRotatingAccountSelector({
      busyCooldownMs: accountBusyCooldownMs,
      unauthorizedCooldownMs: accountUnauthorizedCooldownMs,
    }),
    sdk: approvedGatewayLlmSdkIdentity,
    clock: deps.clock,
    sleep: abortableSleep,
    // Serving means the control token works and the gateway still offers the profile.
    probe: async () => (await control.profiles({
      signal: AbortSignal.timeout(healthProbeTimeoutMs) })).profiles
      .some((profile) => profile.profileId === config.route.profileId),
  });
};

/** The reader-summary agent-runtime port for the selected transport. */
export const createReaderSummaryAgentRuntimeClient = (params: {
  readonly transport: ReaderSummaryAgentRuntimeTransport;
  readonly env: NodeJS.ProcessEnv;
  readonly clock: Clock;
  readonly runId: string;
  readonly agentRuntime: () => AgentRuntimeClientPort;
}): AgentRuntimeClientPort => {
  assertReaderSummaryTransportBackend(params.transport, params.env);
  return params.transport === "gateway-llm"
    ? createGatewayLlmAgentRuntimeClient(resolveGatewayLlmTransportConfig(params.env),
      { clock: params.clock, runId: params.runId })
    : params.agentRuntime();
};

const readTokenFile = (path: string): string => readFileSync(path, "utf8");

const abortableSleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = optional(env, name);
  if (value === undefined) {
    throw new Error(`${name} is required for AGENT_RUNTIME_TRANSPORT=gateway-llm`);
  }
  return value;
};

const optional = (env: NodeJS.ProcessEnv, name: string): string | undefined =>
  env[name]?.trim() || undefined;

const revision = (env: NodeJS.ProcessEnv, name: string): number => {
  const value = Number(required(env, name));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
};

const boundedInteger = (
  env: NodeJS.ProcessEnv, name: string, fallback: number, max: number,
): number => {
  const raw = optional(env, name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new Error(`${name} must be an integer in 1..${max}`);
  }
  return value;
};
