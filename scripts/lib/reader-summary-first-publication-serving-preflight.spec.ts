import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import * as sharedKernel from "@social-monitor/shared-kernel";
import { ReaderSummaryJob, buildReaderSummaryPeriod } from "@social-monitor/summary/domain";
import * as firstPublication from "./reader-summary-first-publication";
import * as serving from "./reader-summary-serving-authority";
import * as identity from "./reader-summary-production-day-attempt-identity";
import * as periodPolicy from "./reader-summary-capture-period-policy";
import { firstpubFixture, firstpubScope, firstpubStart, firstpubEnd } from "./reader-summary-first-publication.spec-support";

// Execute the complete CLI bytes with fail-closed import doubles. No production
// exports/hooks, Prisma connection, native process, health RPC or provider call.
// The optional source path is for replaying the exact sealed prior bytes offline.
const sourcePath = process.env.FIRSTPUB_REVIEW_CAPTURE_SOURCE ??
  resolve(__dirname, "../capture-durable-reader-summary-from-postgres.ts");
const compiled = transpileModule(readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2023 },
}).outputText;

type Fixture = Awaited<ReturnType<typeof firstpubFixture>>;
type Mode = "firstpub" | "ordinary" | "replay" | "refresh";
type Options = {
  mode?: Mode;
  env?: Record<string, string>;
  healthFailure?: boolean;
  healthUncertain?: boolean;
  invalidIdentity?: boolean;
  wrongAuthority?: boolean;
  missingAuthority?: boolean;
  revalidationFailure?: boolean;
  fixture?: Fixture;
};

async function runCapture(options: Options = {}) {
  const fixture = options.fixture ?? await firstpubFixture();
  const mode = options.mode ?? "firstpub";
  const events: string[] = [];
  const op = fixture.operation();
  const reserve = jest.spyOn(op, "reserve").mockImplementation(async () => {
    events.push("reserve");
    await firstPublication.FirstPublicationOperation.prototype.reserve.call(op);
  });
  const checkHealth = jest.fn(async () => {
    events.push("health");
    if (options.healthUncertain) throw new Error("Synthetic health uncertainty");
    return { status: options.healthFailure ? "not-serving" : "serving",
      runtimeEngine: "subscription-runtime-cli", runtimeVersion: "1.4.2",
      launcherSha256: "a".repeat(64), warnings: [] };
  });
  const provider = jest.fn(async () => {
    events.push("provider");
    throw new Error("Synthetic provider uncertainty");
  });
  const request = jest.fn(async () => {
    events.push("request");
    return { ok: true, value: { created: true, readerSummaryJobId: "synthetic-job" } };
  });
  let error = "";
  let finish!: () => void;
  const completed = new Promise<void>((done) => { finish = done; });
  const connection = {
    $queryRaw: async () => { events.push("inventory"); return []; },
    close: async () => { events.push("close"); },
    disconnect: async () => { events.push("close"); },
    $disconnect: async () => { events.push("close"); },
  };
  class Empty {}
  const doubles: Record<string, unknown> = {
    loadDotenvIfPresent: () => undefined,
    resolvePostgresRuntimePoolConfig: () => ({}),
    SystemClock: class { now = fixture.clock.now; },
    GrpcAgentRuntimeClient: { connect: () => ({ checkHealth }) },
    PrismaFeedConnection: { create: async () => connection },
    PrismaSummaryConnection: { create: async () => connection },
    PrismaMonitoringConnection: { create: async () => connection },
    createReaderSummaryDailyCaptureContext: () => ({
      dailyReplay: mode === "replay" ? {} : null, operationalClock: fixture.clock }),
    createReaderSummaryCaptureExecution: () => ({
      liveObservationCutoff: undefined,
      execute: async (dependencies: readonly unknown[]) => {
        if (mode === "firstpub") {
          const authority = dependencies[20] as firstPublication.FirstPublicationOperation;
          expect(authority).toBe(op);
          events.push("claim");
          if (options.revalidationFailure) fixture.db.rows[0]!.version++;
          await authority.claim(ReaderSummaryJob.request({
            ...fixture.input, id: "synthetic-job", scope: { type: "workspace" },
            tenantId: sharedKernel.tenantId(firstpubScope.tenantId),
            workspaceId: sharedKernel.workspaceId(firstpubScope.workspaceId),
            idempotencyKey: op.idempotencyKey, requestedAt: fixture.clock.now(),
            period: buildReaderSummaryPeriod({ cadence: "daily", timezone: "UTC",
              startedAt: firstpubStart, endedAt: firstpubEnd }),
          }).toSnapshot());
        }
        return provider();
      } }),
    resolveProductionDayPromotionInput: () => ({
      promotionRebuild: mode === "refresh" ? { rebuildIdentity: "b".repeat(64) } : undefined,
      sourceProvenance: { kind: "live-production" } }),
    resolveHistoricalGitHubOmission: () => undefined,
    resolveRecoveryTimestampPolicy: () => ({ active: false, policy: "published_at" }),
    revalidateProductionDayPromotionInput: async () => {
      events.push("revalidate");
      // The production promotion helper is a no-op for first publication.
      // First-publication revalidation remains in the real authority claim.
    },
    ensureReaderSummaryProductionDayPolicy: async () => { events.push("policy-write"); },
    createReaderSummaryDailyCapturePublicationWiring: () => ({
      inventory: [], evidenceSelector: {}, model: {}, topicMapBuilder: {},
    }),
    RequestReaderSummaryUseCase: class { execute = request; },
    createRecoverableReaderSummaryPublication: () => ({ publication: {}, recovery: null }),
    readerSummaryPromotionControl: () => ({}),
    assertProductionDayPromotionRetrySafe: () => undefined,
    parseHistoricalPromotionGenerationAuthority: () => null,
  };
  for (const name of ["DurableReaderSummaryExecutionAttestationCapture", "PrismaFeedItemReadRepository",
    "PrismaReaderSummaryJobRepository", "PrismaReaderSummaryArtifactRepository", "PrismaReaderSummaryPolicyRepository",
    "MonitoringConfiguredInterestReader", "PrismaInterestRepository", "CapturingReaderSummaryJobQueue",
    "AllowingSummaryQuota", "DatasetGuardedReaderSummaryEvidenceSelector", "PrismaReaderSummaryPublication",
    "InMemoryMetricsRecorder", "ReaderSummaryPromotionMetricsRecorder"]) doubles[name] = Empty;
  const modules: Record<string, unknown> = {
    "@social-monitor/shared-kernel": { ...sharedKernel, SystemClock: doubles.SystemClock },
    "@social-monitor/summary/domain": { buildReaderSummaryPeriod },
    "./lib/reader-summary-capture-period-policy": periodPolicy,
    "./lib/reader-summary-first-publication": { ...firstPublication, readFirstPublicationOperation: () => op },
    "./lib/reader-summary-serving-authority": { ...serving,
      resolveReaderSummaryServingAuthority: async (input: Parameters<typeof serving.resolveReaderSummaryServingAuthority>[0]) => {
        events.push("authority");
        const value = await serving.resolveReaderSummaryServingAuthority(input);
        if (options.missingAuthority) return { ...value, runtime: null };
        if (options.wrongAuthority) return { ...value, summaryGenerator: {
          ...value.summaryGenerator, physicalModel: "wrong-physical-model" } };
        if (options.invalidIdentity) return { ...value, topicLabeler: { ...value.topicLabeler, reasoningPolicy: "" } };
        return value;
      } },
    "./lib/reader-summary-production-day-attempt-identity": { ...identity,
      readerSummaryProductionDayAttemptIdentity: (input: identity.ReaderSummaryProductionDayAttemptIdentityInput) => {
        events.push("identity");
        return identity.readerSummaryProductionDayAttemptIdentity(input);
      } },
  };
  const fakeProcess = {
    env: { DATABASE_URL: "synthetic-offline-only", AGENT_RUNTIME_GRPC_ADDRESS: "synthetic-offline-only",
      DURABLE_READER_SUMMARY_TENANT_ID: firstpubScope.tenantId,
      DURABLE_READER_SUMMARY_WORKSPACE_ID: firstpubScope.workspaceId,
      DURABLE_READER_SUMMARY_CADENCE: "daily", DURABLE_READER_SUMMARY_MODEL: "agent-runtime",
      DURABLE_READER_SUMMARY_TOPIC_LABELER: "agent-runtime",
      DURABLE_READER_SUMMARY_PERIOD_STARTED_AT: firstpubStart.toISOString(),
      DURABLE_READER_SUMMARY_PERIOD_ENDED_AT: firstpubEnd.toISOString(),
      DURABLE_READER_SUMMARY_DATASET_MANIFEST_PATH: "synthetic-input",
      DURABLE_READER_SUMMARY_DATASET_MANIFEST_SHA256: fixture.input.manifestSha256,
      DURABLE_READER_SUMMARY_RECOVERY_ROOT: "synthetic-root",
      AGENT_RUNTIME_READER_SUMMARY_BACKEND: "xiaomi-mimo-token-plan", ...options.env },
    argv: ["node", "synthetic-cli", ...(mode === "firstpub" ? ["--historical-first-publication"] : [])],
    exitCode: 0,
  };
  runInNewContext(compiled, {
    exports: {}, Date, Buffer, Error, process: fakeProcess,
    console: { error: (message: string) => { error = message; finish(); } },
    require: (name: string) => modules[name] ?? new Proxy({}, {
      get: (_target, key: string) => {
        if (Object.hasOwn(doubles, key)) return doubles[key];
        // Never load an unapproved dependency or silently perform an effect.
        return () => { throw new Error(`Unexpected offline dependency: ${name}.${key}`); };
      },
    }),
  }, { filename: sourcePath, timeout: 2000 });
  await completed;
  return { fixture, op, events, reserve, checkHealth, request, provider, error, exitCode: fakeProcess.exitCode };
}

it.each([
  ["wrong configured model", { env: { AGENT_RUNTIME_READER_SUMMARY_GENERATION_MODEL: "wrong-model" } }, "conflicts"],
  ["wrong physical authority", { wrongAuthority: true }, "authority diverged"],
  ["missing runtime authority", { missingAuthority: true }, "authority diverged"],
  ["unproven runtime", { healthFailure: true }, "not production-safe"],
  ["uncertain health", { healthUncertain: true }, "health uncertainty"],
  ["invalid canonical identity", { invalidIdentity: true }, "reasoning policy is required"],
] as const)("%s fails before reservation, mutation, request and generation", async (_label, options, message) => {
  const s = await runCapture(options);
  expect(s.error).toContain(message);
  expect(s.reserve).not.toHaveBeenCalled();
  expect(s.request).not.toHaveBeenCalled();
  expect(s.provider).not.toHaveBeenCalled();
  expect(s.events).not.toContain("policy-write");
  expect(s.events).not.toContain("revalidate");
  expect(s.fixture.db.claims.slots).toBe(0);
  expect(s.exitCode).toBe(1);
});

it("pins authority/identity once, then reserves before revalidation, policy, request and uncertain provider effects", async () => {
  const s = await runCapture();
  expect(s.error).toContain("Synthetic provider uncertainty");
  expect(s.events.filter((event) => event !== "close")).toEqual([
    "authority", "health", "identity", "reserve", "revalidate", "policy-write", "inventory", "request", "claim", "provider",
  ]);
  expect(s.reserve).toHaveBeenCalledTimes(1);
  expect(s.checkHealth).toHaveBeenCalledTimes(1);
  expect(s.provider).toHaveBeenCalledTimes(1);
  expect(s.fixture.db.claims.slots).toBe(1);
  expect(s.op.evidence()).toMatchObject({ reserved: true, consumed: true });
  expect(s.op.sourceProvenance.observationCutoff).toBe(s.fixture.inventory.datasetManifest.generatedAt);
  const retry = await runCapture({ fixture: s.fixture });
  expect(retry.error).toContain("already claimed");
  expect(retry.request).not.toHaveBeenCalled();
  expect(retry.provider).not.toHaveBeenCalled();
  expect(s.fixture.db.claims.slots).toBe(1);
});

it("post-reservation dataset failure consumes the day without provider retry or reclaim", async () => {
  const s = await runCapture({ revalidationFailure: true });
  expect(s.error).toContain("dataset changed");
  expect(s.reserve).toHaveBeenCalledTimes(1);
  expect(s.fixture.db.claims.slots).toBe(1);
  expect(s.op.evidence()).toMatchObject({ reserved: true, consumed: true });
  expect(s.request).toHaveBeenCalledTimes(1);
  expect(s.provider).not.toHaveBeenCalled();
  s.fixture.db.rows[0]!.version--; // Even restored valid input cannot reclaim the day.
  await expect(s.fixture.operation().reserve()).rejects.toThrow("already claimed");
  expect(s.fixture.db.claims.slots).toBe(1);
});

it.each(["ordinary", "replay", "refresh"] as const)("%s keeps serving/identity at the original position", async (mode) => {
  const s = await runCapture({ mode });
  expect(s.error).toContain("Synthetic provider uncertainty");
  expect(s.reserve).not.toHaveBeenCalled();
  const beforeAuthority = mode === "refresh" ? ["revalidate", "inventory"] :
    mode === "replay" ? ["revalidate", "policy-write"] : ["revalidate", "policy-write", "inventory"];
  expect(s.events.filter((event) => event !== "close")).toEqual([
    ...beforeAuthority, "authority", "health", "identity", "request", "provider",
  ]);
});
