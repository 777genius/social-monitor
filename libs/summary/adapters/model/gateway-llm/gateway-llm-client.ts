import { LLM_MAX_DEADLINE_MS } from "@agent-teams/account-gateway/llm";
import type {
  LlmClient, LlmEffort, LlmFailure, LlmPolicy, LlmSuccess, LlmTask,
} from "@agent-teams/account-gateway/llm";
import type { Clock } from "@social-monitor/shared-kernel";
import {
  canonicalJsonSha256, gatewayLlmRuntimeEngine, observedModelMatches,
  selectedAgentRuntimeOutput,
} from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";

import type {
  AgentRuntimeClientPort, AgentRuntimeFailure, AgentRuntimeHealthResult,
  AgentRuntimeProvider, AgentRuntimeTaskCommand, AgentRuntimeTaskResult,
} from "../../../ports";
import type { GatewayLlmAccountSelector } from "./gateway-llm-account-selector";
import type { GatewayLlmAttemptIdentity, GatewayLlmAttemptSource } from "./gateway-llm-attempts";
import {
  gatewayLlmFailure, gatewayLlmLocalFailure, gatewayLlmModelMismatch,
} from "./gateway-llm-failure";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

/** One gateway profile serving one agent-runtime provider. */
export type GatewayLlmRoute = {
  readonly profileId: string;
  readonly models: readonly string[];
  readonly accountRefs: readonly string[];
  readonly defaultMaxOutputTokens: number;
};

/**
 * Turns a product JSON Schema into the provider structured-output schema and
 * maps the provider value back to the product shape. Codex strict mode needs
 * this translation; the product schemas are not strict-mode schemas.
 */
export interface GatewayStructuredOutputPlanner {
  plan(schema: Readonly<Record<string, unknown>>): {
    readonly schema: Readonly<Record<string, unknown>>;
    readonly decode: (value: unknown) => Record<string, unknown>;
  };
}

export type GatewayLlmClientOptions = {
  readonly llm: Pick<LlmClient, "generate">;
  readonly policy: LlmPolicy;
  readonly routes: Readonly<Partial<Record<AgentRuntimeProvider, GatewayLlmRoute>>>;
  readonly attempts: GatewayLlmAttemptSource;
  readonly accounts: GatewayLlmAccountSelector;
  readonly structuredOutput: GatewayStructuredOutputPlanner;
  readonly sdk: GatewayLlmSdkIdentity;
  readonly clock: Clock;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Retries that cannot duplicate cost: replay before dispatch, or busy. */
  readonly maxDispatchFreeRetries?: number;
  readonly probe?: () => Promise<boolean>;
};

type PreparedTask = Omit<LlmTask<Record<string, unknown>>, "taskId" | "attempt" | "accountRefs">;
type Prepared = {
  readonly task: PreparedTask;
  readonly route: GatewayLlmRoute;
  readonly reasoningEffort: string;
  readonly structured: boolean;
};

const efforts: ReadonlySet<string> = new Set<LlmEffort>(
  ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);

/**
 * Agent-runtime port over the account-gateway `llm` SDK: one bounded model
 * call per task. Workspace, cwd and provider-instance fields of the port are
 * CLI concerns and are ignored here. The SDK never retries; this adapter only
 * repeats attempts that cannot have been paid, and leaves every possibly
 * duplicated cost to the caller.
 */
export class GatewayLlmClient implements AgentRuntimeClientPort {
  private readonly maxRetries: number;

  constructor(private readonly options: GatewayLlmClientOptions) {
    this.maxRetries = options.maxDispatchFreeRetries ?? 2;
  }

  async runTask(
    command: AgentRuntimeTaskCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<AgentRuntimeTaskResult> {
    const startedAt = this.options.clock.now().getTime();
    const prepared = this.prepare(command, startedAt);
    if ("failure" in prepared) return failed(prepared.failure, 0);
    let identity = this.options.attempts.next(command.requestId);
    let task = this.withAttempt(prepared, identity);
    for (let retries = 0; ; retries += 1) {
      const result = await this.options.llm.generate(task, options);
      const now = this.options.clock.now();
      if (result.ok) {
        this.observe(result.receipt.accountRef, "completed", 0, now);
        return this.completed(command, prepared, identity, result, now.getTime() - startedAt);
      }
      const retry = result.retry;
      const afterMs = retry.kind === "never" ? 0 : retry.afterMs;
      this.observe(result.execution?.accountRef ?? null, observation(result), afterMs, now);
      const remainingMs = prepared.task.deadline.getTime() - now.getTime();
      const replay = retry.kind === "same_attempt" ||
        (retry.kind === "new_attempt" && !retry.mayDuplicateCost);
      if (!replay || retries >= this.maxRetries || options?.signal?.aborted === true ||
          remainingMs <= afterMs) {
        return failed(gatewayLlmFailure(result, identity), now.getTime() - startedAt);
      }
      await this.options.sleep(afterMs, options?.signal);
      if (retry.kind === "new_attempt") {
        identity = this.options.attempts.next(command.requestId);
        task = this.withAttempt(prepared, identity);
      }
    }
  }

  async checkHealth(): Promise<AgentRuntimeHealthResult> {
    let serving = true;
    try {
      serving = this.options.probe === undefined || await this.options.probe();
    } catch {
      serving = false;
    }
    return {
      status: serving ? "serving" : "not_serving",
      runtimeEngine: gatewayLlmRuntimeEngine,
      runtimeVersion: this.options.sdk.packageVersion,
      launcherSha256: this.options.sdk.archiveSha256,
      warnings: [],
    };
  }

  private prepare(command: AgentRuntimeTaskCommand, startedAt: number):
  Prepared | { readonly failure: AgentRuntimeFailure } {
    const route = this.options.routes[command.provider];
    const controls = command.controls;
    const model = controls.model;
    if (route === undefined || typeof model !== "string" || !route.models.includes(model) ||
        (controls.modelBackend !== undefined && controls.modelBackend !== "openai-chatgpt")) {
      return { failure: gatewayLlmLocalFailure("unsupported_route",
        "Gateway has no route for the requested provider and model") };
    }
    const effort = controls.reasoningEffort;
    if (effort !== undefined && (typeof effort !== "string" || !efforts.has(effort))) {
      return { failure: gatewayLlmLocalFailure("invalid_request",
        "Gateway task reasoning effort is not supported") };
    }
    if (command.systemPrompt.trim().length === 0 || !(command.timeoutMs > 0)) {
      return { failure: gatewayLlmLocalFailure("invalid_request",
        "Gateway task requires instructions and a positive timeout") };
    }
    const structured = Object.keys(command.outputSchema).length > 0;
    let output: PreparedTask["output"] = { mode: "text" };
    let decode: PreparedTask["decode"];
    if (structured) {
      try {
        const plan = this.options.structuredOutput.plan(command.outputSchema);
        output = { mode: "json_schema", schema: plan.schema, strict: true };
        decode = plan.decode;
      } catch {
        return { failure: gatewayLlmLocalFailure("invalid_schema",
          "Gateway task output schema is not supported") };
      }
    }
    const maxOutputTokens = controls.maxOutputTokens;
    return {
      route,
      structured,
      reasoningEffort: typeof effort === "string" ? effort : "default",
      task: {
        profileId: route.profileId,
        model,
        policy: this.options.policy,
        instructions: command.systemPrompt,
        input: command.prompt,
        output,
        ...(typeof effort === "string" ? { effort: effort as LlmEffort } : {}),
        maxOutputTokens: Number.isSafeInteger(maxOutputTokens) && (maxOutputTokens as number) > 0
          ? maxOutputTokens as number : route.defaultMaxOutputTokens,
        deadline: new Date(startedAt + Math.min(command.timeoutMs, LLM_MAX_DEADLINE_MS)),
        ...(decode === undefined ? {} : { decode }),
      },
    };
  }

  private withAttempt(prepared: Prepared, identity: GatewayLlmAttemptIdentity):
  LlmTask<Record<string, unknown>> {
    return {
      ...prepared.task,
      taskId: identity.taskId,
      attempt: identity.attempt,
      accountRefs: this.options.accounts.order({ taskId: identity.taskId,
        accountRefs: prepared.route.accountRefs, now: this.options.clock.now() }),
    };
  }

  private completed(
    command: AgentRuntimeTaskCommand, prepared: Prepared, identity: GatewayLlmAttemptIdentity,
    result: LlmSuccess<Record<string, unknown>>, durationMs: number,
  ): AgentRuntimeTaskResult {
    const receipt = result.receipt;
    if (!observedModelMatches(prepared.task.model, receipt.observedModel)) {
      return failed(gatewayLlmModelMismatch(identity), durationMs);
    }
    const output = prepared.structured
      ? { structuredOutput: result.value } : { outputText: result.text };
    const selected = selectedAgentRuntimeOutput(output);
    const usage = result.usage;
    return {
      status: "completed",
      ...output,
      warnings: result.cleanup === "pending" ? [{ code: "gateway_cleanup_pending",
        message: "Gateway execution close was not acknowledged" }] : [],
      ...(usage.inputTokens === null || usage.outputTokens === null ? {} : {
        usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens, estimatedCostUsd: 0 },
      }),
      durationMs,
      executionAttestation: {
        schemaVersion: 1,
        requestId: command.requestId,
        purpose: command.purpose,
        canonicalRequestSha256: canonicalJsonSha256({
          purpose: command.purpose, provider: command.provider,
          profileId: prepared.task.profileId, model: prepared.task.model,
          reasoningEffort: prepared.reasoningEffort,
          maxOutputTokens: prepared.task.maxOutputTokens,
          systemPrompt: command.systemPrompt, prompt: command.prompt,
          outputSchema: command.outputSchema,
        }),
        provider: command.provider,
        model: prepared.task.model,
        reasoningEffort: prepared.reasoningEffort,
        runtimeEngine: gatewayLlmRuntimeEngine,
        runtimePackageVersion: this.options.sdk.packageVersion,
        launcherSha256: this.options.sdk.archiveSha256,
        gateway: {
          profileId: receipt.profileId, taskId: receipt.taskId, attempt: receipt.attempt,
          executionRef: receipt.executionRef, requestRef: receipt.requestRef,
          accountRef: receipt.accountRef, observedModel: receipt.observedModel,
          requestSha256: receipt.requestSha256,
        },
        selectedOutputKind: selected.kind,
        selectedOutputSha256: selected.sha256,
      },
    };
  }

  private observe(accountRef: string | null,
    outcome: "completed" | "busy" | "unauthorized" | "other", retryAfterMs: number, now: Date): void {
    this.options.accounts.observe({ accountRef, outcome, retryAfterMs, now });
  }
}

const observation = (failure: LlmFailure): "busy" | "unauthorized" | "other" =>
  failure.code === "busy" ? "busy" : failure.code === "unauthorized" ? "unauthorized" : "other";

const failed = (failure: AgentRuntimeFailure, durationMs: number): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], failure, durationMs,
});
