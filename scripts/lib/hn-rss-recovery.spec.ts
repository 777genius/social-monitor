import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertPrivateJournalDir, assertRecoveryAcquisitionPermit, assertRecoveryAcquisitionPermitInDisposableJournalForTest, completeRecoveryInDisposableJournalForTest, reserveRecovery, reserveRecoveryInDisposableJournalForTest } from "./hn-rss-recovery-journal";
import { executeRecoveryAcquisition, executeRecoveryAcquisitionInDisposableJournalForTest } from "./hn-rss-recovery-acquisition";
import * as recoveryPlanModule from "./hn-rss-recovery-plan";
import { parseRecoveryArgs, parseRecoveryCliArgs, recoveryCliJournalDir, recoveryPlan, sha256 } from "./hn-rss-recovery-plan";
import { runRecovery, runRecoveryInDisposableJournalForTest } from "../run-hn-rss-recovery";

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
const withoutJournalDir = (values: readonly string[]): string[] => {
  const index = values.indexOf("--journal-dir");
  return values.filter((_, position) => position !== index && position !== index + 1);
};
const runSyntheticProcess = (script: string, values: readonly string[]): Promise<{ code: number | null; signal: NodeJS.Signals | null; output: string; error: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-r", "ts-node/register/transpile-only", "-r", "tsconfig-paths/register", script, ...values], {
      cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", TZ: "UTC", TS_NODE_PROJECT: join(process.cwd(), "tsconfig.build.json"),
        ...(process.env.NODE_PATH === undefined ? {} : { NODE_PATH: process.env.NODE_PATH }) },
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, output: output.trim(), error: error.trim() }));
  });

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

  it("binds every real CLI invocation to the same authority and rejects directory switches", () => {
    const other = mkdtempSync(join(tmpdir(), "hn-rss-other-journal-"));
    try {
      const base = withoutJournalDir(args(directory));
      const plan = parseRecoveryCliArgs(base, now);
      const apply = parseRecoveryCliArgs([...base, "--apply", "--plan-sha256", "a".repeat(64)], now);
      expect(plan.journalDir).toBe(recoveryCliJournalDir);
      expect(apply.journalDir).toBe(plan.journalDir);
      expect(() => parseRecoveryCliArgs(args(directory), now)).toThrow("--journal-dir is not accepted");
      expect(() => parseRecoveryCliArgs(args(other), now)).toThrow("--journal-dir is not accepted");
      expect(() => parseRecoveryCliArgs([...base, "--journal-dir", other, "--apply", "--plan-sha256", "a".repeat(64)], now)).toThrow("--journal-dir is not accepted");
      expect(readdirSync(directory)).toEqual([]);
      expect(readdirSync(other)).toEqual([]);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects journal path aliases and symlinks before reservation", async () => {
    const alias = `${directory}-alias`;
    symlinkSync(directory, alias, "dir");
    try {
      expect(() => assertPrivateJournalDir(alias)).toThrow("canonical absolute path");
      expect(() => assertPrivateJournalDir(`${directory}/../${directory.split("/").at(-1) ?? ""}`)).toThrow("canonical absolute path");
      await expect(runRecoveryInDisposableJournalForTest({ ...parseRecoveryArgs(args(directory), now), journalDir: alias }, {
        readBinding: async () => binding, acquire: async () => counts,
      })).rejects.toThrow("canonical absolute path");
      const base = withoutJournalDir(args(directory));
      expect(() => parseRecoveryCliArgs([...base, "--journal-dir", alias], now)).toThrow("--journal-dir is not accepted");
      expect(readdirSync(directory)).toEqual([]);
    } finally {
      rmSync(alias);
    }
  });

  it("plans without acquisition, completes once, then treats the same completed plan as a no-op", async () => {
    let calls = 0;
    const dependencies = {
      readBinding: async () => binding,
      acquire: async () => { calls += 1; return counts; },
    };
    const request = parseRecoveryArgs(args(directory), now);
    const plan = await runRecoveryInDisposableJournalForTest(request, dependencies);
    expect(plan.status).toBe("PLAN");
    expect(calls).toBe(0);
    const apply = parseRecoveryArgs(args(directory, ["--apply", "--plan-sha256", String(plan.planSha256)]), now);
    const first = await runRecoveryInDisposableJournalForTest(apply, dependencies);
    const again = await runRecoveryInDisposableJournalForTest(apply, dependencies);
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
    await expect(runRecoveryInDisposableJournalForTest(apply, { readBinding: async () => ({ ...binding, config: { ...binding.config, maxItems: 9 } }), acquire: async () => counts })).rejects.toThrow("Plan changed");
    const other = { ...request, workspaceId: "00000000-0000-7000-8000-000000000202" };
    expect(sha256(recoveryPlan(other, binding))).not.toBe(digest);
  });

  it("canonicalizes UUID scope before hashing and acquisition, and refuses case-variant uncertain retries", async () => {
    const lower = parseRecoveryArgs(args(directory), now);
    const upper = { ...lower, tenantId: tenantId.toUpperCase(), workspaceId: workspaceId.toUpperCase(), sourceBindingId: sourceBindingId.toUpperCase() };
    const digest = sha256(recoveryPlan(lower, binding));
    expect(sha256(recoveryPlan(upper, binding))).toBe(digest);
    let calls = 0;
    const dependencies = {
      readBinding: async (request: typeof lower) => {
        expect(request.tenantId).toBe(tenantId);
        expect(request.workspaceId).toBe(workspaceId);
        expect(request.sourceBindingId).toBe(sourceBindingId);
        return binding;
      },
      acquire: async (request: typeof lower) => {
        expect(request.tenantId).toBe(tenantId);
        calls += 1;
        throw new Error("uncertain synthetic effect");
      },
    };
    await expect(runRecoveryInDisposableJournalForTest({ ...upper, apply: true, planSha256: digest }, dependencies)).rejects.toThrow("uncertain synthetic effect");
    await expect(runRecoveryInDisposableJournalForTest({ ...lower, apply: true, planSha256: digest }, dependencies)).rejects.toThrow("uncertain STARTED");
    expect(calls).toBe(1);
    expect(() => recoveryPlan({ ...lower, tenantId: "malformed" }, binding)).toThrow("UUIDs");
    await expect(runRecoveryInDisposableJournalForTest({ ...lower, sourceBindingId: "malformed" }, dependencies)).rejects.toThrow("UUIDs");
  });

  it("rejects arbitrary journals at the production executor and direct acquisition without a reservation", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    await expect(runRecovery(request, { readBinding: async () => binding, acquire: async () => counts }))
      .rejects.toThrow("authoritative journal directory");
    const absent = join(directory, "absent");
    await expect(runRecovery({ ...request, journalDir: absent }, {
      readBinding: async () => binding, acquire: async () => counts,
    })).rejects.toThrow("authoritative journal directory");
    expect(existsSync(absent)).toBe(false);
    await expect(executeRecoveryAcquisition({
      connection: {} as never, tenantId, workspaceId, sourceBindingId,
      providerKey: "hacker-news", from: request.from, to: request.to, binding,
      runId: "synthetic", attemptId: "synthetic", scanJobId: "synthetic",
    })).rejects.toThrow("requires a durable journal reservation");
    expect(readdirSync(directory)).toEqual([]);
  });

  it("rejects disposable acquisition permits even when their scope matches", () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId,
      scanPolicyId: plan.scanPolicyId, providerKey: plan.providerKey, from: plan.from, to: plan.to,
      configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
    const reserved = reserveRecoveryInDisposableJournalForTest(directory, sha256(plan), scope);
    if (reserved.kind !== "reserved") throw new Error("Expected reservation");
    expect(() => assertRecoveryAcquisitionPermit(reserved.permit, scope, reserved.reservation))
      .toThrow("authoritative journal directory");
    expect(() => reserveRecovery(directory, sha256(plan), scope)).toThrow("authoritative journal directory");
  });

  it("refuses a second real acquisition after STARTED in A when the same digest is reserved in B", async () => {
    const other = mkdtempSync(join(tmpdir(), "hn-rss-other-journal-"));
    const actualAuthority = recoveryPlanModule.recoveryCliJournalDir;
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    // Give this test a private canonical A; the production entrypoint still uses its real authority in every other test.
    Object.defineProperty(recoveryPlanModule, "recoveryCliJournalDir", { value: directory, configurable: true });
    try {
      const request = parseRecoveryArgs(args(directory), now);
      const plan = recoveryPlan(request, binding);
      const digest = sha256(plan);
      const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId,
        scanPolicyId: plan.scanPolicyId, providerKey: plan.providerKey, from: plan.from, to: plan.to,
        configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
      const first = reserveRecovery(directory, digest, scope);
      const second = reserveRecoveryInDisposableJournalForTest(other, digest, scope);
      if (first.kind !== "reserved" || second.kind !== "reserved") throw new Error("Expected two synthetic reservations");
      expect(first.reservation.scanJobId).not.toBe(second.reservation.scanJobId);
      expect(() => assertRecoveryAcquisitionPermit(first.permit, scope, first.reservation)).not.toThrow();
      let providerCalls = 0;
      await expect(executeRecoveryAcquisition({
        connection: {} as never, tenantId, workspaceId, sourceBindingId,
        providerKey: "hacker-news", from: request.from, to: request.to, binding,
        runId: second.reservation.runId, attemptId: second.reservation.attemptId,
        scanJobId: second.reservation.scanJobId, reservationPermit: second.permit,
        provider: { key: () => "hacker-news", validateBinding: () => { providerCalls += 1; return { ok: true }; } } as never,
      })).rejects.toThrow("authoritative journal directory");
      expect(providerCalls).toBe(0);
      await expect(executeRecoveryAcquisitionInDisposableJournalForTest({
        fixture: {} as never,
        connection: {} as never, tenantId, workspaceId, sourceBindingId,
        providerKey: "hacker-news", from: request.from, to: request.to, binding,
        runId: second.reservation.runId, attemptId: second.reservation.attemptId,
        scanJobId: second.reservation.scanJobId, reservationPermit: second.permit,
        provider: { key: () => "hacker-news", validateBinding: () => { providerCalls += 1; return { ok: true }; } } as never,
      } as never, directory)).rejects.toThrow("fixture-owned connection and provider");
      expect(providerCalls).toBe(0);
      expect(() => assertRecoveryAcquisitionPermitInDisposableJournalForTest(
        second.permit, scope, second.reservation, directory)).toThrow("Disposable journal must differ from the authoritative journal");
      expect(() => assertRecoveryAcquisitionPermitInDisposableJournalForTest(
        second.permit, scope, second.reservation, other)).not.toThrow();
      expect(readdirSync(directory)).toEqual([`${digest}.started.json`]);
      expect(readdirSync(other)).toEqual([`${digest}.started.json`]);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
      Object.defineProperty(recoveryPlanModule, "recoveryCliJournalDir", { value: actualAuthority, configurable: true });
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects unsupported binding config during plan validation", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    await expect(runRecoveryInDisposableJournalForTest(request, { readBinding: async () => ({ ...binding, config: { mode: "listing", query: "top" } }), acquire: async () => counts })).rejects.toThrow("requires configured scan passes");
    const tooManyPasses = Array.from({ length: 29 }, () => ({ mode: "search", target: "story", query: "synthetic" }));
    await expect(runRecoveryInDisposableJournalForTest(request, { readBinding: async () => ({ ...binding, config: { ...binding.config, scanPasses: tooManyPasses } }), acquire: async () => counts })).rejects.toThrow("exceed provider bound");
    const rssRequest = { ...request, providerKey: "rss" as const };
    await expect(runRecoveryInDisposableJournalForTest(rssRequest, { readBinding: async () => ({ ...binding, config: { feedUrl: "http://127.0.0.1/private.xml" } }), acquire: async () => counts })).rejects.toThrow();
    expect(readdirSync(directory)).toEqual([]);
  });

  it("refuses RSS request fanout and intraday Google News before reservation or acquisition", async () => {
    let acquisitionCalls = 0;
    const request = { ...parseRecoveryArgs(args(directory), now), providerKey: "rss" as const };
    const acquire = async () => { acquisitionCalls += 1; return counts; };
    const google = "https://news.google.com/rss/search?q=synthetic%20when%3A1d";
    await expect(runRecoveryInDisposableJournalForTest(request, { readBinding: async () => ({ ...binding, config: { feedUrl: google } }), acquire })).rejects.toThrow("full UTC day");
    const day = { ...request, from: "2026-09-23T00:00:00.000Z", to: "2026-09-24T00:00:00.000Z" };
    await expect(runRecoveryInDisposableJournalForTest(day, { readBinding: async () => ({ ...binding, config: { feedUrl: "https://example.test/feed.xml", extraFeedUrls: Array.from({ length: 12 }, (_, index) => `https://example.test/${index}.xml`) } }), acquire })).rejects.toThrow("exceed 12");
    const thirteenTerms = Array.from({ length: 13 }, (_, index) => `term${index}`).join("%20OR%20");
    await expect(runRecoveryInDisposableJournalForTest(day, { readBinding: async () => ({ ...binding, config: { feedUrl: `https://news.google.com/rss/search?q=${thirteenTerms}` } }), acquire })).rejects.toThrow("exceed 12");
    await expect(runRecoveryInDisposableJournalForTest(day, { readBinding: async () => ({ ...binding, config: { feedUrl: "https://news.google.com/rss/search?q=when%3A1d" } }), acquire })).rejects.toThrow("search term");
    expect(acquisitionCalls).toBe(0);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("reserves concurrently with one winner and refuses uncertain or malformed outcomes", () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const digest = sha256(plan);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId, providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
    expect(reserveRecoveryInDisposableJournalForTest(directory, digest, scope).kind).toBe("reserved");
    expect(() => reserveRecoveryInDisposableJournalForTest(directory, digest, scope)).toThrow("uncertain STARTED");
    const otherScope = { ...scope, from: "2026-09-23T15:00:00.000Z" };
    const otherDigest = sha256({ ...plan, from: otherScope.from });
    const [left, right] = [() => reserveRecoveryInDisposableJournalForTest(directory, otherDigest, otherScope), () => reserveRecoveryInDisposableJournalForTest(directory, otherDigest, otherScope)];
    expect(left().kind).toBe("reserved");
    expect(right).toThrow("uncertain STARTED");
    writeFileSync(join(directory, `${digest}.completed.json`), "{bad", { mode: 0o600 });
    expect(() => reserveRecoveryInDisposableJournalForTest(directory, digest, scope)).toThrow();
    expect(() => reserveRecoveryInDisposableJournalForTest(directory, digest, { ...scope, workspaceId: "other" })).toThrow("digest does not match scope");
    for (const status of ["FAILED", "UNKNOWN"]) {
      const path = join(directory, `${otherDigest}.started.json`);
      const started = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
      writeFileSync(path, JSON.stringify({ ...started, status }), { mode: 0o600 });
      expect(() => reserveRecoveryInDisposableJournalForTest(directory, otherDigest, otherScope)).toThrow("inconsistent");
    }
  });

  it("allows one reservation across two separate processes", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const digest = sha256(plan);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId, providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256, interestQuerySha256: plan.interestQuerySha256 };
    const worker = () => runSyntheticProcess(join(__dirname, "hn-rss-recovery-reserve-worker.ts"), [directory, digest, JSON.stringify(scope)]);
    const raced = await Promise.all([worker(), worker()]);
    expect(raced.map((value) => value.code)).toEqual([0, 0]);
    expect(raced.map((value) => value.output).sort()).toEqual(["REFUSED", "RESERVED"]);
    expect((await worker()).output).toBe("REFUSED");
  });

  it("keeps a committed effect uncertain across a process crash and rejects another CLI journal directory", async () => {
    const other = mkdtempSync(join(tmpdir(), "hn-rss-replay-dir-"));
    const effects = mkdtempSync(join(tmpdir(), "hn-rss-synthetic-effect-"));
    try {
      const request = parseRecoveryArgs(args(directory), now);
      const plan = recoveryPlan(request, binding);
      const digest = sha256(plan);
      const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId,
        providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256,
        interestQuerySha256: plan.interestQuerySha256 };
      const effectPath = join(effects, "committed.txt");
      const crashed = await runSyntheticProcess(join(__dirname, "hn-rss-recovery-reserve-worker.ts"),
        [directory, digest, JSON.stringify(scope), effectPath]);
      expect(crashed.signal).toBe("SIGKILL");
      expect(readFileSync(effectPath, "utf8")).toBe("committed\n");
      expect(existsSync(join(directory, `${digest}.started.json`))).toBe(true);
      expect(existsSync(join(directory, `${digest}.completed.json`))).toBe(false);
      const retry = await runSyntheticProcess(join(__dirname, "hn-rss-recovery-reserve-worker.ts"),
        [directory, digest, JSON.stringify(scope)]);
      expect(retry.output).toBe("REFUSED");
      const realCli = join(__dirname, "../run-hn-rss-recovery.ts");
      const switched = await Promise.all([directory, other].map((journalDir) => runSyntheticProcess(realCli,
        args(journalDir, ["--apply", "--plan-sha256", digest]))));
      expect(switched.map((value) => value.code)).toEqual([2, 2]);
      expect(switched.every((value) => value.error.includes("REFUSED_OR_UNCERTAIN"))).toBe(true);
      expect(readdirSync(other)).toEqual([]);
      expect(readFileSync(effectPath, "utf8")).toBe("committed\n");
    } finally {
      rmSync(other, { recursive: true, force: true });
      rmSync(effects, { recursive: true, force: true });
    }
  });

  it("leaves failed acquisition reserved for manual reconciliation", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const digest = sha256(recoveryPlan(request, binding));
    const apply = parseRecoveryArgs(args(directory, ["--apply", "--plan-sha256", digest]), now);
    const dependencies = { readBinding: async () => binding, acquire: async () => { throw new Error("synthetic effect uncertainty"); } };
    await expect(runRecoveryInDisposableJournalForTest(apply, dependencies)).rejects.toThrow("synthetic effect uncertainty");
    await expect(runRecoveryInDisposableJournalForTest(apply, dependencies)).rejects.toThrow("uncertain STARTED");
  });

  it("never completes a reservation carrying any provider warning", async () => {
    const request = parseRecoveryArgs(args(directory), now);
    const digest = sha256(recoveryPlan(request, binding));
    const apply = { ...request, apply: true, planSha256: digest };
    await expect(runRecoveryInDisposableJournalForTest(apply, {
      readBinding: async () => binding,
      acquire: async () => ({ ...counts, warningCount: 1 }),
    })).rejects.toThrow("incomplete");
    expect(readdirSync(directory).sort()).toEqual([`${digest}.started.json`]);
  });

  it("rejects a partial completion even when called directly", () => {
    const request = parseRecoveryArgs(args(directory), now);
    const plan = recoveryPlan(request, binding);
    const digest = sha256(plan);
    const scope = { tenantId, workspaceId, sourceBindingId, interestId: plan.interestId, scanPolicyId: plan.scanPolicyId,
      providerKey: "hacker-news", from: request.from, to: request.to, configSha256: plan.configSha256,
      interestQuerySha256: plan.interestQuerySha256 };
    const reserved = reserveRecoveryInDisposableJournalForTest(directory, digest, scope);
    expect(reserved.kind).toBe("reserved");
    if (reserved.kind !== "reserved") throw new Error("Expected synthetic reservation");
    expect(() => completeRecoveryInDisposableJournalForTest(directory, reserved.reservation, { ...counts, warningCount: 1 })).toThrow("incomplete");
    expect(() => completeRecoveryInDisposableJournalForTest(directory, reserved.reservation, { ...counts, fetched: undefined as unknown as number })).toThrow("invalid");
    const startedPath = join(directory, `${digest}.started.json`);
    const started = JSON.parse(readFileSync(startedPath, "utf8")) as Record<string, unknown>;
    writeFileSync(startedPath, JSON.stringify({ ...started, scanJobId: "00000000-0000-7000-8000-000000000999" }), { mode: 0o600 });
    expect(() => completeRecoveryInDisposableJournalForTest(directory, reserved.reservation, counts)).toThrow("inconsistent");
    expect(readdirSync(directory)).toEqual([`${digest}.started.json`]);
  });
});
