import type {
  AgentRuntimeExecutionRequest,
  AgentRuntimeExecutionResult,
  AgentRuntimeExecutorPort,
} from "../../apps/agent-runtime/src/agent-runtime-executor.port";
import {
  admitSubscriptionRuntimeRequest,
  readerPromotionV2CanaryActivationCapability,
} from "../../apps/agent-runtime/src/subscription-runtime-purpose-model-policy";
import {
  CANARY_SINGLETON_ID,
  canonicalSha256,
  loadCanaryManifest,
  type CanaryArtifact,
  type CanaryBinding,
  type CanaryOutcome,
  type CanaryProvenance,
  type CanaryRequestedBinding,
  type CanaryReceipt,
} from "./reader-promotion-v2-production-canary-contract";
import { runReaderPromotionV2ProductAssertions } from
  "./reader-promotion-v2-production-canary-product-assertions";
import { ReaderPromotionV2ProductionCanaryRunner } from
  "./reader-promotion-v2-production-canary-runner";
import type {
  CanaryClaim,
  CanaryProviderBarrier,
  CanarySnapshot,
  ReaderPromotionV2ProductionCanaryStore,
} from "./reader-promotion-v2-production-canary-store";

describe("Reader Promotion V2 production canary runner", () => {
  it("runs current policy, slate, merge and no-signal product assertions", async () => {
    await expect(runReaderPromotionV2ProductAssertions()).resolves.toMatchObject({
      policyVersion: "reader_promotion_policy.v2",
      thresholdCases: 28,
      groupingCases: 4,
      noSignalModelCalls: 0,
    });
  });

  it("binds exact lineage and stores a redacted allowlist receipt", async () => {
    const fixture = createFixture();
    const result = await fixture.runner.run(runInput());

    expect(result.state).toBe("SUCCEEDED");
    expect(fixture.executor.calls).toBe(1);
    expect(result.receipt).toMatchObject({
      state: "SUCCEEDED",
      outcome: "RESPONSE",
      protectedMainSha: SHA,
      deployedReleaseSha: SHA,
      runtimeImageId: IMAGE_ID,
      schemaName: "social_monitor_reader_summary_story_relations",
      schemaVersion: "reader_summary.story_relation.v1",
      runtimePackageVersion: "0.1.0-main.30",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    });
    expect(Object.keys(result.receipt!).sort()).toEqual(RECEIPT_KEYS);
    const serialized = JSON.stringify({
      snapshot: fixture.store.snapshot,
      events: fixture.store.events,
    });
    for (const forbidden of [
      "systemPrompt", "\"prompt\"", "rawResponse", "rationale", "tenantId",
      "workspaceId", "accessToken", "apiKey", "session", "provider exception",
    ]) expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
  });

  it("permits one provider call across concurrent dispatches and replay", async () => {
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const fixture = createFixture({ providerGate });
    const first = fixture.runner.run(runInput());
    await fixture.executor.entered;
    const other = createRunner(fixture.store, fixture.executor);
    await expect(other.run(runInput({
      ownerId: "dispatch-two", fence: "fence-two",
    }))).resolves.toEqual({ state: "IN_PROGRESS", receipt: null });
    releaseProvider();
    await expect(first).resolves.toMatchObject({ state: "SUCCEEDED" });
    await expect(other.run(runInput({
      ownerId: "dispatch-three", fence: "fence-three",
    }))).resolves.toMatchObject({ state: "SUCCEEDED" });
    expect(fixture.executor.calls).toBe(1);
    expect(fixture.store.events).toEqual([
      "CLAIMED", "MODEL_RUNNING", "MODEL_COMPLETED:RESPONSE",
      "SUCCEEDED:RESPONSE",
    ]);
  });

  it("closes the provider barrier for concurrent identical dispatches", async () => {
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const fixture = createFixture({ providerGate });
    const duplicateRunner = createRunner(fixture.store, fixture.executor);
    const first = fixture.runner.run(runInput());
    const duplicate = duplicateRunner.run(runInput());
    await fixture.executor.entered;
    await expect(duplicate).resolves.toEqual({
      state: "IN_PROGRESS", receipt: null,
    });
    releaseProvider();
    await expect(first).resolves.toMatchObject({ state: "SUCCEEDED" });
    expect(fixture.executor.calls).toBe(1);
  });

  it("rejects stale owner and fence completion", async () => {
    let releaseProvider!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const fixture = createFixture({ providerGate });
    const running = fixture.runner.run(runInput());
    await fixture.executor.entered;
    const binding = fixture.store.snapshot!.binding;
    await expect(fixture.store.completeModel({
      binding: { ...binding, ownerId: "stale", fence: "stale" },
      outcome: "EXPLICIT_FAILURE",
      artifact: null,
      artifactSha256: null,
    })).rejects.toThrow("stale_fence");
    releaseProvider();
    await running;
    expect(fixture.executor.calls).toBe(1);
  });

  it("retries SQL before MODEL_RUNNING without duplicating provider entry", async () => {
    const fixture = createFixture();
    fixture.store.failMarkOnce = true;
    await expect(fixture.runner.run(runInput())).rejects.toThrow("sql_fault");
    expect(fixture.executor.calls).toBe(0);
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "SUCCEEDED",
    });
    expect(fixture.executor.calls).toBe(1);
  });

  it("retries SQL finalization from MODEL_COMPLETED without provider re-entry", async () => {
    const fixture = createFixture();
    fixture.store.failFinalizeOnce = true;
    await expect(fixture.runner.run(runInput())).rejects.toThrow("sql_fault");
    expect(fixture.store.snapshot?.state).toBe("MODEL_COMPLETED");
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "SUCCEEDED",
    });
    expect(fixture.executor.calls).toBe(1);
  });

  it("resumes after completed-before-receipt without a second call", async () => {
    let fail = true;
    const fixture = createFixture({
      afterModelCompleted: async () => {
        if (fail) {
          fail = false;
          throw new Error("fault_completed_before_receipt");
        }
      },
    });
    await expect(fixture.runner.run(runInput())).rejects.toThrow(
      "fault_completed_before_receipt",
    );
    expect(fixture.store.snapshot?.state).toBe("MODEL_COMPLETED");
    fixture.clock.advance(1_000);
    await fixture.runner.run(runInput({
      provenance: { ...provenance(), workflowRunAttempt: 2 },
    }));
    expect(fixture.executor.calls).toBe(1);
  });

  it.each([
    ["killed-before-send", "afterModelRunning"],
    ["lost-response-after-barrier", "afterProviderResponse"],
  ] as const)("atomically rejects %s as uncertainty and never retries", async (_name, hook) => {
    const fixture = createFixture({
      [hook]: async () => { throw new Error("injected_fault"); },
    });
    const terminal = await fixture.runner.run(runInput());
    expect(terminal).toMatchObject({
      state: "REJECTED", receipt: {
        outcome: "UNCERTAIN", rejectionCode: "model_uncertain",
      },
    });
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "REJECTED",
    });
    expect(fixture.executor.calls).toBe(hook === "afterModelRunning" ? 0 : 1);
  });

  it("atomically treats process crash before response as uncertain", async () => {
    const fixture = createFixture({ providerThrows: true });
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "REJECTED", receipt: { outcome: "UNCERTAIN" },
    });
    await fixture.runner.run(runInput());
    expect(fixture.executor.calls).toBe(1);
    expect(fixture.store.snapshot?.outcome).toBe("UNCERTAIN");
    expect(JSON.stringify(fixture.store.snapshot).toLowerCase()).not.toContain(
      "provider exception secret",
    );
  });

  it("finalizes explicit provider failure and never retries it", async () => {
    const fixture = createFixture({ providerFailure: true });
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "REJECTED",
      receipt: { outcome: "EXPLICIT_FAILURE", usage: null },
    });
    await fixture.runner.run(runInput({ ownerId: "replay", fence: "new" }));
    expect(fixture.executor.calls).toBe(1);
  });

  it.each(["agent_runtime.cli_timeout", "agent_runtime.cli_exit",
    "agent_runtime.invalid_cli_result"])(
    "classifies %s as atomic uncertainty with no retry",
    async (failureCode) => {
      const fixture = createFixture({ providerFailure: true, failureCode });
      await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
        state: "REJECTED", receipt: { outcome: "UNCERTAIN" },
      });
      await fixture.runner.run(runInput({ ownerId: "replay", fence: "new" }));
      expect(fixture.executor.calls).toBe(1);
      expect(fixture.store.events.slice(-2)).toEqual([
        "MODEL_COMPLETED:UNCERTAIN", "REJECTED:UNCERTAIN",
      ]);
    },
  );

  it.each([
    ["missing", validDecisions().slice(0, 2)],
    ["extra", [...validDecisions(), {
      leftFeedItemId: "extra", rightFeedItemId: "pair", sameStory: false,
      confidenceScore: 0.99, rationale: "Unrelated items.",
    }]],
    ["duplicate", [validDecisions()[0], ...validDecisions()]],
    ["reversed", validDecisions().map((item) => ({
      ...item,
      leftFeedItemId: item.rightFeedItemId,
      rightFeedItemId: item.leftFeedItemId,
    }))],
    ["low-confidence", validDecisions().map((item, index) =>
      index === 0 ? { ...item, confidenceScore: 0.2 } : item)],
    ["rationale-free", validDecisions().map((item, index) =>
      index === 0 ? { ...item, rationale: "" } : item)],
    ["malformed", [{ sameStory: true }]],
    ["unknown-property", validDecisions().map((item, index) =>
      index === 0 ? { ...item, unexpected: true } : item)],
  ])("rejects a %s relation batch", async (_name, decisions) => {
    const fixture = createFixture({ decisions });
    const result = await fixture.runner.run(runInput());
    expect(result).toMatchObject({
      state: "REJECTED", receipt: { outcome: "EXPLICIT_FAILURE" },
    });
    expect(fixture.executor.calls).toBe(1);
  });

  it("rejects an unknown response-envelope property", async () => {
    const fixture = createFixture({ outputExtra: { unexpected: true } });
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "REJECTED", receipt: { outcome: "EXPLICIT_FAILURE" },
    });
  });

  it.each([
    ["model", { model: "gpt-5.5" }],
    ["reasoning", { reasoningEffort: "medium" }],
    ["schema/request", { canonicalRequestSha256: "f".repeat(64) }],
    ["runtime", { runtimePackageVersion: "0.0.1" }],
    ["launcher", { launcherSha256: "e".repeat(64) }],
    ["usage", { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 3 } }],
  ])("rejects wrong %s lineage", async (_name, mutation) => {
    const fixture = createFixture({ resultMutation: mutation });
    await expect(fixture.runner.run(runInput())).resolves.toMatchObject({
      state: "REJECTED",
    });
  });

  it("rejects wrong deployed provenance before claim or provider access", async () => {
    const fixture = createFixture();
    await expect(fixture.runner.run(runInput({ provenance: {
      ...provenance(), deployedRuntimeSha: "b".repeat(40),
    } }))).rejects.toThrow("canary_provenance_mismatch");
    expect(fixture.store.snapshot).toBeNull();
    expect(fixture.executor.calls).toBe(0);
  });

  it("rejects a mutable runtime image reference before claim", async () => {
    const fixture = createFixture();
    await expect(fixture.runner.run(runInput({ provenance: {
      ...provenance(), runtimeImageId: "social-monitor-prod-daily-runner:latest",
    } }))).rejects.toThrow("canary_runtime_identity_invalid");
    expect(fixture.store.snapshot).toBeNull();
    expect(fixture.executor.calls).toBe(0);
  });
});

const SHA = "a".repeat(40);
const IMAGE_ID = `sha256:${"b".repeat(64)}`;
const RECEIPT_KEYS = [
  "artifactSha256", "canonicalRequestSha256", "deployedBackendSha",
  "deployedControlSha", "deployedReleaseSha", "deployedRuntimeSha", "fence",
  "format", "launcherSha256", "manifestSha256", "outcome", "runtimeImageId",
  "model", "protectedMainSha", "reasoningEffort", "rejectionCode", "runtimePackageSha256",
  "runtimePackageVersion", "schemaName", "schemaSha256", "schemaVersion",
  "singletonId", "state", "usage", "workflow", "workflowRunAttempt",
  "workflowRunId",
].sort();

const provenance = (): CanaryProvenance => ({
  protectedMainSha: SHA,
  deployedReleaseSha: SHA,
  deployedBackendSha: SHA,
  deployedControlSha: SHA,
  deployedRuntimeSha: SHA,
  runtimeImageId: IMAGE_ID,
  workflow: "reader-promotion-v2-production-canary",
  workflowRunId: "12345",
  workflowRunAttempt: 1,
  runtimePackageVersion: "0.1.0-main.30",
  runtimePackageSha256: "c".repeat(64),
  launcherSha256: "d".repeat(64),
});

const runInput = (override: Partial<Parameters<
  ReaderPromotionV2ProductionCanaryRunner["run"]
>[0]> = {}) => ({
  targetSha: SHA,
  ownerId: "dispatch-one",
  fence: "fence-one",
  provenance: provenance(),
  ...override,
});

type FixtureOptions = {
  readonly providerGate?: Promise<void>;
  readonly providerThrows?: boolean;
  readonly providerFailure?: boolean;
  readonly failureCode?: string;
  readonly decisions?: readonly unknown[];
  readonly outputExtra?: Readonly<Record<string, unknown>>;
  readonly resultMutation?: Readonly<Record<string, unknown>>;
  readonly afterModelRunning?: () => Promise<void>;
  readonly afterProviderResponse?: () => Promise<void>;
  readonly afterModelCompleted?: () => Promise<void>;
};

const createFixture = (options: FixtureOptions = {}) => {
  const clock = new FakeClock(new Date("2026-09-04T12:00:00.000Z"));
  const store = new FakeCanaryStore(clock);
  const executor = new FakeExecutor(options);
  const runner = createRunner(store, executor, options);
  return { clock, store, executor, runner };
};

const createRunner = (
  store: FakeCanaryStore,
  executor: FakeExecutor,
  options: FixtureOptions = {},
) => new ReaderPromotionV2ProductionCanaryRunner({
  manifest: loadCanaryManifest(),
  store,
  executor,
  afterModelRunning: options.afterModelRunning,
  afterProviderResponse: options.afterProviderResponse,
  afterModelCompleted: options.afterModelCompleted,
});

class FakeClock {
  constructor(private value: Date) {}
  now(): Date { return new Date(this.value); }
  advance(ms: number): void { this.value = new Date(this.value.getTime() + ms); }
}

class FakeExecutor implements AgentRuntimeExecutorPort {
  calls = 0;
  private enteredResolve!: () => void;
  readonly entered = new Promise<void>((resolve) => {
    this.enteredResolve = resolve;
  });
  constructor(private readonly options: FixtureOptions) {}
  async execute(request: AgentRuntimeExecutionRequest): Promise<AgentRuntimeExecutionResult> {
    this.calls += 1;
    this.enteredResolve();
    await this.options.providerGate;
    if (this.options.providerThrows) throw new Error("provider exception secret");
    if (this.options.providerFailure) return {
      status: "failed", warnings: [], failure: {
        code: this.options.failureCode ??
          "provider_request_rejected_before_execution",
        safeMessage: "failed",
        retryable: this.options.failureCode !== undefined,
        reconnectRequired: false, causeCategory: "provider", details: {},
      },
    };
    const structuredOutput = {
      decisions: this.options.decisions ?? validDecisions(),
      ...this.options.outputExtra,
    };
    const canonicalRequestSha256 = canonicalSha256(
      admitSubscriptionRuntimeRequest(
        request,
        readerPromotionV2CanaryActivationCapability,
      ).canonicalRequest,
    );
    const result: AgentRuntimeExecutionResult = {
      status: "completed",
      warnings: [],
      structuredOutput,
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18,
        estimatedCostUsd: 0 },
      executionAttestation: {
        schemaVersion: 1,
        requestId: request.requestId,
        purpose: request.purpose,
        canonicalRequestSha256,
        provider: "codex",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        runtimeEngine: "subscription-runtime-cli",
        runtimePackageVersion: "0.1.0-main.30",
        launcherSha256: "d".repeat(64),
        selectedOutputKind: "structured_output",
        selectedOutputSha256: canonicalSha256(structuredOutput),
      },
    };
    return mutateResult(result, this.options.resultMutation);
  }
  checkHealth() {
    return Promise.resolve({ healthy: true, runtimeEngine: "fake",
      runtimeVersion: "fake", warnings: [] });
  }
}

const mutateResult = (
  result: AgentRuntimeExecutionResult,
  mutation: Readonly<Record<string, unknown>> | undefined,
): AgentRuntimeExecutionResult => {
  if (mutation === undefined) return result;
  if (mutation.usage !== undefined) return {
    ...result,
    usage: mutation.usage as AgentRuntimeExecutionResult["usage"],
  };
  return {
    ...result,
    executionAttestation: {
      ...result.executionAttestation!,
      ...mutation,
    },
  };
};

class FakeCanaryStore implements ReaderPromotionV2ProductionCanaryStore {
  snapshot: CanarySnapshot | null = null;
  readonly events: string[] = [];
  failMarkOnce = false;
  failFinalizeOnce = false;

  constructor(private readonly clock: FakeClock) {}

  claim(requestedBinding: CanaryRequestedBinding): Promise<CanaryClaim> {
    this.expire();
    if (this.snapshot === null) {
      const binding: CanaryBinding = {
        ...requestedBinding,
        reconciliationDeadline: new Date(this.clock.now().getTime() + 180_000),
      };
      this.snapshot = snapshot(binding, "CLAIMED");
      this.events.push("CLAIMED");
      return Promise.resolve({ action: "OWNER", snapshot: this.snapshot });
    }
    if (["SUCCEEDED", "REJECTED"].includes(this.snapshot.state)) {
      return Promise.resolve({ action: "TERMINAL", snapshot: this.snapshot });
    }
    const binding: CanaryBinding = {
      ...requestedBinding,
      reconciliationDeadline: this.snapshot.binding.reconciliationDeadline,
    };
    if (sameExecutionBinding(this.snapshot.binding, binding) &&
        ["CLAIMED", "MODEL_COMPLETED"].includes(this.snapshot.state)) {
      return Promise.resolve({ action: "OWNER", snapshot: this.snapshot });
    }
    return Promise.resolve({ action: "IN_PROGRESS", snapshot: this.snapshot });
  }

  markModelRunning(binding: CanaryBinding): Promise<CanaryProviderBarrier> {
    if (this.failMarkOnce) {
      this.failMarkOnce = false;
      throw new Error("sql_fault");
    }
    if (this.snapshot !== null && sameBinding(this.snapshot.binding, binding) &&
        this.snapshot.state === "MODEL_RUNNING") {
      return Promise.resolve({ action: "IN_PROGRESS", snapshot: this.snapshot });
    }
    this.own(binding, "CLAIMED");
    this.snapshot = { ...this.snapshot!, state: "MODEL_RUNNING" };
    this.events.push("MODEL_RUNNING");
    return Promise.resolve({ action: "ENTER", snapshot: this.snapshot });
  }

  async completeModel(params: {
    readonly binding: CanaryBinding;
    readonly outcome: CanaryOutcome;
    readonly artifact: CanaryArtifact | null;
    readonly artifactSha256: string | null;
  }): Promise<CanarySnapshot> {
    this.expire();
    if (this.snapshot?.state === "REJECTED") return Promise.resolve(this.snapshot);
    this.own(params.binding, "MODEL_RUNNING");
    this.snapshot = {
      ...this.snapshot!, state: "MODEL_COMPLETED", outcome: params.outcome,
      artifact: params.artifact, artifactSha256: params.artifactSha256,
      rejectionCode: params.outcome === "EXPLICIT_FAILURE"
        ? "model_explicit_failure" : null,
    };
    this.events.push(`MODEL_COMPLETED:${params.outcome}`);
    return Promise.resolve(this.snapshot);
  }

  rejectUncertain(binding: CanaryBinding): Promise<CanarySnapshot> {
    this.own(binding, "MODEL_RUNNING");
    this.events.push("MODEL_COMPLETED:UNCERTAIN", "REJECTED:UNCERTAIN");
    const receipt = uncertainReceipt(binding);
    this.snapshot = {
      ...this.snapshot!, state: "REJECTED", outcome: "UNCERTAIN",
      receipt, rejectionCode: "model_uncertain",
    };
    return Promise.resolve(this.snapshot);
  }

  finalize(params: {
    readonly binding: CanaryBinding;
    readonly receipt: CanaryReceipt;
  }): Promise<CanarySnapshot> {
    if (this.failFinalizeOnce) {
      this.failFinalizeOnce = false;
      throw new Error("sql_fault");
    }
    if (this.snapshot?.state === "SUCCEEDED" ||
        this.snapshot?.state === "REJECTED") return Promise.resolve(this.snapshot);
    this.own(params.binding, "MODEL_COMPLETED");
    this.snapshot = {
      ...this.snapshot!, state: params.receipt.state,
      receipt: params.receipt, rejectionCode: params.receipt.rejectionCode,
    };
    this.events.push(`${params.receipt.state}:${params.receipt.outcome}`);
    return Promise.resolve(this.snapshot);
  }

  read(): Promise<CanarySnapshot | null> {
    this.expire();
    return Promise.resolve(this.snapshot);
  }

  private own(binding: CanaryBinding, state: string): void {
    if (this.snapshot === null || !sameBinding(this.snapshot.binding, binding)) {
      throw new Error("stale_fence");
    }
    if (this.snapshot.state !== state) throw new Error("invalid_transition");
  }

  private expire(): void {
    if (this.snapshot?.state !== "MODEL_RUNNING" ||
        this.clock.now() < this.snapshot.binding.reconciliationDeadline) return;
    this.events.push("MODEL_COMPLETED:UNCERTAIN", "REJECTED:UNCERTAIN");
    const receipt = uncertainReceipt(this.snapshot.binding);
    this.snapshot = {
      ...this.snapshot, state: "REJECTED", outcome: "UNCERTAIN",
      receipt, rejectionCode: "model_uncertain",
    };
  }
}

const snapshot = (binding: CanaryBinding, state: "CLAIMED"): CanarySnapshot => ({
  binding, state, outcome: null, artifact: null, artifactSha256: null,
  receipt: null, rejectionCode: null,
});
const sameBinding = (left: CanaryBinding, right: CanaryBinding): boolean =>
  canonicalSha256({ ...left, reconciliationDeadline:
    left.reconciliationDeadline.toISOString() }) ===
  canonicalSha256({ ...right, reconciliationDeadline:
    right.reconciliationDeadline.toISOString() });
const sameExecutionBinding = (
  left: CanaryBinding,
  right: CanaryBinding,
): boolean => {
  const comparable = (value: CanaryBinding) => Object.fromEntries(
    Object.entries(value).filter(([key]) =>
      key !== "reconciliationDeadline" && key !== "workflowRunAttempt"),
  );
  return canonicalSha256(comparable(left)) === canonicalSha256(comparable(right));
};
const uncertainReceipt = (binding: CanaryBinding): CanaryReceipt => ({
  format: "reader-promotion-v2-production-canary-receipt.v1",
  singletonId: CANARY_SINGLETON_ID,
  state: "REJECTED", outcome: "UNCERTAIN",
  protectedMainSha: binding.protectedMainSha,
  deployedReleaseSha: binding.deployedReleaseSha,
  deployedBackendSha: binding.deployedBackendSha,
  deployedControlSha: binding.deployedControlSha,
  deployedRuntimeSha: binding.deployedRuntimeSha,
  runtimeImageId: binding.runtimeImageId,
  manifestSha256: binding.manifestSha256,
  schemaName: binding.schemaName,
  schemaVersion: binding.schemaVersion,
  schemaSha256: binding.schemaSha256,
  model: binding.model,
  reasoningEffort: binding.reasoningEffort,
  canonicalRequestSha256: binding.canonicalRequestSha256,
  workflow: binding.workflow,
  workflowRunId: binding.workflowRunId,
  workflowRunAttempt: binding.workflowRunAttempt,
  fence: binding.fence,
  runtimePackageVersion: binding.runtimePackageVersion,
  runtimePackageSha256: binding.runtimePackageSha256,
  launcherSha256: binding.launcherSha256,
  artifactSha256: null, usage: null, rejectionCode: "model_uncertain",
});

function validDecisions() { return [
  { leftFeedItemId: "cursor", rightFeedItemId: "spacex", sameStory: true,
    confidenceScore: 0.99, rationale: "The requested relation is confirmed." },
  { leftFeedItemId: "anthropic-watermark-x",
    rightFeedItemId: "anthropic-watermark-reddit", sameStory: true,
    confidenceScore: 0.99, rationale: "Both describe the watermark launch." },
  { leftFeedItemId: "claude-code-watermark",
    rightFeedItemId: "claude-code-security", sameStory: false,
    confidenceScore: 0.99, rationale: "These are separate product events." },
]; }
