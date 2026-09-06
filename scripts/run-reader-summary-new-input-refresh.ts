import { credentials } from "@grpc/grpc-js";
import { AgentRuntimeServiceClient } from "@social-monitor/contracts/generated/grpc/agent_runtime/v1/agent_runtime";
import { mkdirSync, constants, realpathSync, openSync, writeSync, fsyncSync, closeSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runWithTenantDatabaseAccess, resolvePostgresRuntimePoolConfig } from "@social-monitor/platform-persistence";
import { SystemClock } from "@social-monitor/shared-kernel";
import { PrismaFeedConnection } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-connection";
import { PrismaFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/prisma/prisma-feed-item-read.repository";
import { PrismaSummaryConnection } from "@social-monitor/summary/adapters/persistence/prisma/prisma-summary-connection";
import { GrpcAgentRuntimeClient } from "@social-monitor/summary/adapters/model/grpc-agent-runtime-client";
import { requiredHistoricalPromotionSystemDatabaseUrl, assertHistoricalPromotionSystemRole } from "./lib/reader-summary-promotion-v2-system-database";
import { refreshScope, refreshDates, refreshOperation, refreshBytesHash,
  assertRefreshManifest, type RefreshManifest } from "./lib/reader-summary-new-input-refresh-manifest";
import { refreshSourceSha256, readReviewedRefresh, assertRefreshFences, readRefreshFenceAuthority } from "./lib/reader-summary-new-input-refresh-files";
import { captureRefreshAuthority, preflightRefreshSelection, assertRefreshHasNewInput, refreshPeriod } from "./lib/reader-summary-new-input-refresh-capture";
import { readRefreshJobs, readRefreshPrior } from "./lib/reader-summary-new-input-refresh-postgres";
import { refreshGenerationSha256 } from "./lib/reader-summary-new-input-refresh-model";
import { assertRefreshEqual } from "./lib/reader-summary-new-input-refresh-guard";
import { executeNewInputRefresh } from "./lib/reader-summary-new-input-refresh-execution";
import { resolveReaderSummaryServingAuthority } from "./lib/reader-summary-serving-authority";

export function parseRefreshCommand(argv: readonly string[]) {
  if (argv.length === 1 && argv[0] === "--source-sha256") return { mode: "source" } as const;
  if (argv.length === 4 && argv[0] === "--apply" && argv[2] === "--sha256" && /^[0-9a-f]{64}$/u.test(argv[3]!)) {
    return { mode: "apply", path: argv[1]!, sha256: argv[3]! } as const;
  }
  if (argv.length === 0 || (argv.length === 1 && argv[0] === "--prepare")) {
    return { mode: "prepare", dates: refreshDates } as const;
  }
  if (argv.length === 3 && argv[0] === "--prepare" && argv[1] === "--date" && refreshDates.includes(argv[2]!)) {
    return { mode: "prepare", dates: [argv[2]!] } as const;
  }
  throw new Error("Use --prepare [--date ACCEPTED_DATE], --apply MANIFEST --sha256 HASH, or --source-sha256");
}
async function main(): Promise<void> {
  const command = parseRefreshCommand(process.argv.slice(2));
  if (command.mode === "source") { console.log(refreshSourceSha256()); return; }
  const clock = new SystemClock();
  const sourceSha256 = refreshSourceSha256();
  const deployedSourceSha256 = required("READER_SUMMARY_REFRESH_DEPLOYED_SOURCE_SHA256");
  if (sourceSha256 !== deployedSourceSha256) throw new Error("Refresh source differs from reviewed deployed source");
  const runtimeAuthority = JSON.parse(required("READER_SUMMARY_REFRESH_RUNTIME_AUTHORITY_JSON")) as RefreshManifest["runtime"];
  const generationSha256 = refreshGenerationSha256(process.env);
  const fencePaths = {
    globalLock: required("READER_SUMMARY_REFRESH_GLOBAL_LOCK"),
    dateDirectory: required("READER_SUMMARY_REFRESH_DATE_LOCK_DIR"),
    fenceDirectory: required("READER_SUMMARY_REFRESH_FENCE_DIR"),
  };
  const fenceAuthority = readRefreshFenceAuthority(fencePaths);
  const config = resolvePostgresRuntimePoolConfig({ ...process.env,
    DATABASE_URL: requiredHistoricalPromotionSystemDatabaseUrl(process.env),
    POSTGRES_RUNTIME_PROCESS: "daily-runner", POSTGRES_RUNTIME_POOL_MIN: "0", POSTGRES_RUNTIME_POOL_MAX: "2" });
  const summary = await PrismaSummaryConnection.create(config);
  const feedConnection = await PrismaFeedConnection.create(config);
  const feed = new PrismaFeedItemReadRepository(feedConnection);
  const output = resolve(".cache/reader-summary-new-input-refresh");
  mkdirSync(output, { recursive: true, mode: 0o700 });
  if (realpathSync(output) !== output) throw new Error("Refresh evidence directory must not contain symlinks");
  try {
    await runWithTenantDatabaseAccess(refreshScope, async () => {
      await assertHistoricalPromotionSystemRole(summary);
      if (command.mode === "prepare") {
        for (const date of command.dates) {
          if ((await readRefreshJobs(summary, date)).length > 0) {
            console.log(JSON.stringify({ date, status: "consumed_use_original_manifest_to_reconcile" }));
            continue;
          }
          const observedThrough = clock.now();
          const prior = await readRefreshPrior(summary, date);
          const authority = await captureRefreshAuthority({ client: summary, feed, date, observedThrough, clock });
          await assertRefreshHasNewInput(summary, date, prior.observedThrough, observedThrough.toISOString());
          const eligible = await preflightRefreshSelection({ feed, date, observedThrough, clock });
          assertRefreshEqual(await captureRefreshAuthority({ client: summary, feed, date, observedThrough, clock }), authority, "preparation input");
          assertRefreshEqual(await readRefreshPrior(summary, date), prior, "preparation prior");
          const period = refreshPeriod(date);
          const value: Omit<RefreshManifest, "operation"> = {
            format: "reader-summary-seven-day-new-input-v1", ...refreshScope, date,
            startedAt: period.startedAt.toISOString(), endedAt: period.endedAt.toISOString(), timezone: "UTC",
            observedThrough: observedThrough.toISOString(), preparedAt: clock.now().toISOString(),
            prior, authority, sourceSha256, deployedSourceSha256, generationSha256,
            runtime: runtimeAuthority, fenceAuthority, model: "gpt-5.6-sol", reasoningEffort: "high",
          };
          const manifest: RefreshManifest = { ...value, operation: refreshOperation(value) };
          assertRefreshManifest(manifest, clock.now());
          const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
          const sha256 = refreshBytesHash(bytes);
          const path = join(output, `${date}.${sha256}.json`);
          writeFileSync(path, bytes, { flag: "wx", mode: 0o400 });
          console.log(JSON.stringify({ date, status: eligible ? "prepared" : "no_eligible_input",
            path, sha256, operation: manifest.operation, observedThrough: manifest.observedThrough,
            counts: { feed: authority.feedCount, candidates: authority.eligibleCount, selected: eligible } }));
        }
        return;
      }
      const manifest = readReviewedRefresh(command.path, command.sha256);
      // Expired successful operations can reconcile, but cannot start again.
      assertRefreshManifest(manifest, clock.now(), false);
      const assertSource = () => {
        assertRefreshEqual(refreshSourceSha256(), manifest.sourceSha256, "source");
        assertRefreshEqual(deployedSourceSha256, manifest.deployedSourceSha256, "deployment");
        assertRefreshEqual(refreshGenerationSha256(process.env), manifest.generationSha256, "model configuration");
      };
      const assertFences = () => assertRefreshFences(manifest.date, fencePaths,
        process.env.READER_SUMMARY_DATE_FENCE_TOKEN, manifest.fenceAuthority);
      assertFences(); assertSource();
      const channel = new AgentRuntimeServiceClient(required("AGENT_RUNTIME_GRPC_ADDRESS"), credentials.createInsecure());
      const runtime = new GrpcAgentRuntimeClient(channel, clock, {
        timeoutMs: 5_000, serviceToken: process.env.AGENT_RUNTIME_SERVICE_TOKEN });
      const record = (event: unknown) => {
        const fd = openSync(join(output, `${manifest.date}.journal.jsonl`), constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try { writeSync(fd, JSON.stringify({ at: clock.now().toISOString(), event }) + "\n"); fsyncSync(fd); }
        finally { closeSync(fd); }
      };
      try {
        const receipt = await executeNewInputRefresh({ manifest, summary, feed, clock, env: process.env,
          runtime, assertFences, assertSource, record,
          assertRuntime: async () => {
            const serving = await resolveReaderSummaryServingAuthority({ summaryModelMode: "agent-runtime",
              topicLabelerMode: "agent-runtime", env: process.env, agentRuntimeClient: runtime,
              checkedAt: clock.now().toISOString() });
            assertRefreshEqual(serving.runtime, manifest.runtime, "deployed runtime");
          },
        });
        record({ ...receipt, operation: manifest.operation, manifestSha256: command.sha256,
          observedThrough: manifest.observedThrough });
        console.log(JSON.stringify(receipt));
      } catch {
        record({ status: "stopped_requires_reconciliation", operation: manifest.operation, manifestSha256: command.sha256 });
        throw new Error("Refresh stopped; reconcile original operation");
      } finally { channel.close(); }
    });
  } finally { await feedConnection.close(); await summary.close(); }
}
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}
if (require.main === module) void main().catch(() => {
  // SQL and provider exceptions can contain payloads or credentials.
  console.error("Reader summary refresh stopped. Reconcile the original manifest/job; do not reset its budget.");
  process.exitCode = 1;
});
