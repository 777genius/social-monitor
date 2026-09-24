import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { reserveRecovery } from "./hn-rss-recovery-journal";
import { parseRecoveryArgs, recoveryPlan, sha256 } from "./hn-rss-recovery-plan";
import { runRecovery } from "../run-hn-rss-recovery";

const now = new Date("2026-09-24T00:00:00.000Z");
const tenantId = "00000000-0000-7000-8000-000000000101";
const workspaceId = "00000000-0000-7000-8000-000000000102";
const sourceBindingId = "00000000-0000-7000-8000-000000000103";
const args = (journalDir: string, extra: readonly string[] = []) => [
  "--tenant-id", tenantId, "--workspace-id", workspaceId,
  "--source-binding-id", sourceBindingId, "--provider", "hacker-news",
  "--from", "2026-09-23T16:00:00.000Z", "--to", "2026-09-23T17:00:00.000Z",
  "--journal-dir", journalDir, ...extra,
];
const binding = {
  interestId: "00000000-0000-7000-8000-000000000104",
  scanPolicyId: "00000000-0000-7000-8000-000000000105",
  interestQuery: "synthetic monitoring",
  config: { mode: "search", query: "synthetic monitoring", maxItems: 10 },
};
const counts = { fetched: 1, inserted: 1, projected: 1, skippedDuplicates: 0, warningCount: 0 };

describe("HN/RSS recovery plan and journal", () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "hn-rss-r3-test-")); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });

  it("rejects unsafe CLI scope, providers, windows and missing apply digest", () => {
    const valid = parseRecoveryArgs(args(directory), now);
    expect(valid.apply).toBe(false);
    expect(() => parseRecoveryArgs(args(directory, ["--apply"]), now)).toThrow("requires --plan-sha256");
    expect(() => parseRecoveryArgs(args(directory).map((value) => value === "hacker-news" ? "reddit" : value), now)).toThrow("not allowed");
    expect(() => parseRecoveryArgs(args(directory).map((value) => value === tenantId ? "wrong" : value), now)).toThrow("UUIDs");
    expect(() => parseRecoveryArgs(args(directory).map((value) => value === "2026-09-23T17:00:00.000Z" ? "2026-09-23T16:00:00.000Z" : value), now)).toThrow("interval");
    expect(() => parseRecoveryArgs(args(directory).map((value) => value === "2026-09-23T17:00:00.000Z" ? "2026-09-25T00:00:00.000Z" : value), now)).toThrow("interval");
    expect(() => parseRecoveryArgs(args(directory).map((value) => value === "2026-09-23T16:00:00.000Z" ? "2026-09-22T16:00:00.000Z" : value), now)).toThrow("interval");
    expect(() => parseRecoveryArgs(args(directory).concat(["--provider", "rss"]), now)).toThrow("duplicate");
  });

  it("plans without acquisition, completes once, then treats the same completed plan as a no-op", async () => {
    let calls = 0;
    const dependencies = {
      readBinding: async () => binding,
      acquire: async () => { calls += 1; return counts; },
    };
    const request = parseRecoveryArgs(args(directory), now);
    const plan = await runRecovery(request, dependencies);
    expect(plan.status).toBe("PLAN");
    expect(calls).toBe(0);
    const apply = parseRecoveryArgs(args(directory, ["--apply", "--plan-sha256", String(plan.planSha256)]), now);
    const first = await runRecovery(apply, dependencies);
    const again = await runRecovery(apply, dependencies);
    expect(first.status).toBe("COMPLETED");
    expect(again.status).toBe("ALREADY_COMPLETED");
    expect(calls).toBe(1);
    expect(first.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.attemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.scanJobId).toMatch(/^[0-9a-f-]{36}$/);
    expect(readFileSync(join(directory, `${plan.planSha256}.started.json`), "utf8")).not.toContain("synthetic monitoring");
  });

  it("requires a new exact plan for config or scope drift", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const digest = sha256(recoveryPlan(request, binding));
    const apply = parseRecoveryArgs(args(directory, ["--apply", "--plan-sha256", digest]), now);
    await expect(runRecovery(apply, { readBinding: async () => ({ ...binding, config: { ...binding.config, maxItems: 9 } }), acquire: async () => counts })).rejects.toThrow("Plan changed");
    const other = { ...request, workspaceId: "00000000-0000-7000-8000-000000000202" };
    expect(sha256(recoveryPlan(other, binding))).not.toBe(digest);
  });

  it("rejects unsupported binding config during plan validation", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    await expect(runRecovery(request, { readBinding: async () => ({ ...binding, config: { mode: "listing", query: "top" } }), acquire: async () => counts })).rejects.toThrow("requires configured scan passes");
    const rssRequest = { ...request, providerKey: "rss" as const };
    await expect(runRecovery(rssRequest, { readBinding: async () => ({ ...binding, config: { feedUrl: "http://127.0.0.1/private.xml" } }), acquire: async () => counts })).rejects.toThrow();
  });

  it("reserves concurrently with one winner and refuses uncertain or malformed outcomes", () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const digest = sha256(plan);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId, providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
    expect(reserveRecovery(directory, digest, scope).kind).toBe("reserved");
    expect(() => reserveRecovery(directory, digest, scope)).toThrow("uncertain STARTED");
    const otherDigest = "a".repeat(64);
    const [left, right] = [() => reserveRecovery(directory, otherDigest, scope), () => reserveRecovery(directory, otherDigest, scope)];
    expect(left().kind).toBe("reserved");
    expect(right).toThrow("uncertain STARTED");
    writeFileSync(join(directory, `${digest}.completed.json`), "{bad", { mode: 0o600 });
    expect(() => reserveRecovery(directory, digest, scope)).toThrow();
    expect(() => reserveRecovery(directory, digest, { ...scope, workspaceId: "other" })).toThrow("inconsistent");
    for (const status of ["FAILED", "UNKNOWN"]) {
      const path = join(directory, `${otherDigest}.started.json`);
      const started = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      writeFileSync(path, JSON.stringify({ ...started, status }), { mode: 0o600 });
      expect(() => reserveRecovery(directory, otherDigest, scope)).toThrow("inconsistent");
    }
  });

  it("allows one reservation across two separate processes", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const digest = sha256(plan);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId, providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
    const worker = () => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", join(__dirname, "hn-rss-recovery-reserve-worker.ts"), directory, digest, JSON.stringify(scope)], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, TS_NODE_PROJECT: join(process.cwd(), "tsconfig.build.json") } });
      let output = "";
      let failure = "";
      child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer) => { failure += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(output.trim()) : reject(new Error(`Synthetic reservation worker failed: ${failure}`)));
    });
    expect((await Promise.all([worker(), worker()])).sort()).toEqual(["REFUSED", "RESERVED"]);
  });

  it("leaves failed acquisition reserved for manual reconciliation", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const digest = sha256(recoveryPlan(request, binding));
    const apply = parseRecoveryArgs(args(directory, ["--apply", "--plan-sha256", digest]), now);
    const dependencies = { readBinding: async () => binding, acquire: async () => { throw new Error("synthetic effect uncertainty"); } };
    await expect(runRecovery(apply, dependencies)).rejects.toThrow("synthetic effect uncertainty");
    await expect(runRecovery(apply, dependencies)).rejects.toThrow("uncertain STARTED");
  });
});
