import {
  LLM_MAX_DEADLINE_MS, LlmSchemaError, prepareStrictJsonSchema,
} from "@agent-teams/account-gateway/llm";
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
  AgentRuntimeTaskCommand, AgentRuntimeTaskResult,
} from "../../../ports";
import { gatewayDefaultReasoningEffort } from "../active-reader-summary-generation-profile";
import type { GatewayLlmAccountSelector } from "./gateway-llm-account-selector";
import type { GatewayLlmAttemptIdentity, GatewayLlmAttemptSource } from "./gateway-llm-attempts";
import {
  gatewayLlmFailure, gatewayLlmLocalFailure, gatewayLlmModelMismatch,
} from "./gateway-llm-failure";
import { toGatewayOutputSchema } from "./gateway-llm-output-schema";
import type { GatewayLlmSdkIdentity } from "./gateway-llm-sdk-identity";

/**
 * The one gateway profile and model a client serves. Tasks must name exactly
 * this backend and model; anything else is refused before any gateway call.
 */
export type GatewayLlmRoute = {
  readonly profileId: string;
  /** Reader-summary backend a task names in controls.modelBackend. */
  readonly modelBackend: string;
  readonly model: string;
  /** Effort sent with every task; undefined sends no reasoning control. */
  readonly reasoningEffort?: LlmEffort;
  readonly accountRefs: readonly string[];
  /**
   * Floor of max_output_tokens. Reasoning models spend output tokens before
   * the answer, so the product budgets alone end as output_truncated.
   */
  readonly minOutputTokens: number;
};

export type GatewayLlmClientOptions = {
  readonly llm: Pick<LlmClient, "generate">;
  readonly policy: LlmPolicy;
  readonly route: GatewayLlmRoute;
  readonly attempts: GatewayLlmAttemptSource;
  readonly accounts: GatewayLlmAccountSelector;
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
  /** Where the last decoded output broke the schema, as a safe path:keyword. */
  readonly outputViolation: () => string | undefined;
};

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
        return failed(gatewayLlmFailure(result, identity, prepared.outputViolation()),
          now.getTime() - startedAt);
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
    const route = this.options.route;
    const controls = command.controls;
    if (controls.model !== route.model || controls.modelBackend !== route.modelBackend) {
      return { failure: gatewayLlmLocalFailure("unsupported_route",
        "Gateway has no route for the requested model") };
    }
    if (controls.reasoningEffort !== route.reasoningEffort) {
      return { failure: gatewayLlmLocalFailure("invalid_request",
        "Gateway task reasoning effort conflicts with the route policy") };
    }
    if (command.systemPrompt.trim().length === 0 || !(command.timeoutMs > 0)) {
      return { failure: gatewayLlmLocalFailure("invalid_request",
        "Gateway task requires instructions and a positive timeout") };
    }
    const structured = Object.keys(command.outputSchema).length > 0;
    let output: PreparedTask["output"] = { mode: "text" };
    let decode: PreparedTask["decode"];
    let violation: string | undefined;
    if (structured) {
      // Strict providers need every property required and objects closed;
      // decode strips the added nulls and validates the original schema, so
      // a provider that ignores the schema still cannot pass invalid output.
      try {
        const strict = prepareStrictJsonSchema(toGatewayOutputSchema(command.outputSchema));
        output = { mode: "json_schema", schema: strict.schema, strict: true };
        decode = (value) => {
          violation = undefined;
          try {
            return objectOutput(strict.decode(value));
          } catch (error) {
            violation = error instanceof LlmSchemaError ? error.detail : "not_an_object";
            throw error;
          }
        };
      } catch (error) {
        if (!(error instanceof LlmSchemaError)) throw error;
        return { failure: gatewayLlmLocalFailure("invalid_schema",
          "Gateway task output schema is not supported") };
      }
    }
    const requested = controls.maxOutputTokens;
    return {
      route,
      structured,
      outputViolation: () => violation,
      reasoningEffort: route.reasoningEffort ?? gatewayDefaultReasoningEffort,
      task: {
        profileId: route.profileId,
        model: route.model,
        policy: this.options.policy,
        instructions: command.systemPrompt,
        input: command.prompt,
        output,
        ...(route.reasoningEffort === undefined ? {} : { effort: route.reasoningEffort }),
        maxOutputTokens: Math.max(route.minOutputTokens,
          Number.isSafeInteger(requested) && (requested as number) > 0 ? requested as number : 0),
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

const objectOutput = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Gateway structured output is not an object");
  }
  return value as Record<string, unknown>;
};

const observation = (failure: LlmFailure): "busy" | "unauthorized" | "other" =>
  failure.code === "busy" ? "busy" : failure.code === "unauthorized" ? "unauthorized" : "other";

const failed = (failure: AgentRuntimeFailure, durationMs: number): AgentRuntimeTaskResult => ({
  status: "failed", warnings: [], failure, durationMs,
});
