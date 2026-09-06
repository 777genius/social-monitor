import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, truncateSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as NodeFilesystem from "node:fs";
import { incidentFixture } from "./retained-metric-amendment.spec-support";
import { canonicalMetricRefreshJson, metricRefreshDigest, SecureMetricRefreshReceipts } from "./retained-metric-refresh-receipts";
import { metricEvidencePath, resolveMetricOperation } from "@social-monitor/ingestion/features/refresh-retained-metrics/metric-refresh-amendment";
const fs = jest.requireActual<typeof NodeFilesystem>("node:fs");

describe("whole-directory metric authority and durable adoption", () => {
  let root: string, f: ReturnType<typeof incidentFixture>;
  const path = (name: string) => join(root, metricEvidencePath(name));
  const resolve = (receipts = f.receipts) => receipts.withOperation((o) => resolveMetricOperation(o, metricRefreshDigest, f.clock.now(), true));
  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "metric-journal-")); f = incidentFixture(root, 1);
    await f.receipts.install(metricEvidencePath("operation.json"), f.original);
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
  it.each(["batch-99999.reserved.json", "batch-12.observed.json", "result-00000000-0000-7000-8000-000000009999.json", "final.json"])("never interprets orphan %s as zero budget", async (name) => {
    await f.receipts.install(metricEvidencePath(name), {});
    await expect(resolve()).rejects.toThrow("metric_budget_already_started");
    await expect(f.amendment().prepare(metricRefreshDigest(f.original), "must stop")).rejects.toThrow();
    expect(f.inventory.list).not.toHaveBeenCalled();
  });
  it.each(["unknown.json", "batch-01.reserved.json", "amendment-000009.json", "nested"])("refuses unknown name %s across the entire namespace", async (name) => {
    if (name === "nested") mkdirSync(path(name), { mode: 0o700 });
    else writeFileSync(path(name), "{}", { mode: 0o400 });
    await expect(resolve()).rejects.toThrow();
  });
  it.each(["empty", "duplicate", "noncanonical", "null", "bad_schema", "depth", "oversized", "unsafe_mode", "hardlink", "symlink", "fifo"])("refuses %s evidence without absence or blocking", async (kind) => {
    const leaf = path("batch-99999.reserved.json");
    const envelope = canonicalMetricRefreshJson({ digest: metricRefreshDigest({}), value: {} });
    if (kind === "fifo") expect(spawnSync("mkfifo", ["-m", "400", leaf]).status).toBe(0);
    else if (kind === "symlink") symlinkSync(path("operation.json"), leaf);
    else if (kind === "hardlink") linkSync(path("operation.json"), leaf);
    else {
      const text = kind === "empty" ? "" : kind === "duplicate" ? envelope.replace('"value":{}', '"value":{},"value":{}') :
        kind === "noncanonical" ? `${envelope}\n` : kind === "null" ? "null" : kind === "depth" ? "[".repeat(34) + "0" + "]".repeat(34) :
          kind === "bad_schema" ? canonicalMetricRefreshJson({ digest: metricRefreshDigest(null), value: null }) : envelope;
      writeFileSync(leaf, text, { mode: 0o600 });
      if (kind === "oversized") truncateSync(leaf, 16 * 1024 * 1024 + 1);
      chmodSync(leaf, kind === "unsafe_mode" ? 0o600 : 0o400);
    }
    await expect(resolve()).rejects.toThrow();
    expect(f.inventory.list).not.toHaveBeenCalled();
  });
  it.each(["leaf", "parent", "ancestor", "enumeration"])("detects %s replacement during a descriptor-anchored read", async (kind) => {
    let changed = false;
    const receipts = SecureMetricRefreshReceipts.forTest(root, (point, name) => {
      if (changed || (kind === "enumeration" ? point !== "directory_enumerated" : point !== "file_opened" || name !== "operation.json")) return;
      changed = true;
      if (kind === "leaf") { const bytes = readFileSync(path(name)); unlinkSync(path(name)); writeFileSync(path(name), bytes, { mode: 0o400 }); }
      else if (kind === "enumeration") writeFileSync(path("unknown.json"), "", { mode: 0o400 });
      else {
        const directory = kind === "parent" ? path("") : join(root, "seven-day-6101-6102");
        renameSync(directory, `${directory.replace(/\/$/u, "")}-old`);
        mkdirSync(directory, { mode: 0o700 });
      }
    });
    await expect(resolve(receipts)).rejects.toThrow();
    expect(changed).toBe(true);
  });
  it("does not turn a vanished known leaf or parent into a missing receipt", async () => {
    await f.receipts.withOperation(async (o) => {
      await o.read(metricEvidencePath("operation.json"));
      unlinkSync(path("operation.json"));
      await expect(o.read(metricEvidencePath("operation.json"))).rejects.toThrow();
    });
  });
  it("requires the durability barrier even for complete equal-byte replay", async () => {
    const receipts = SecureMetricRefreshReceipts.forTest(root, (point, name) => {
      if (point === "before_adoption_sync" && name === "operation.json") throw new Error("injected fsync unavailable");
    });
    await expect(receipts.install(metricEvidencePath("operation.json"), f.original)).rejects.toThrow("fsync unavailable");
    await expect(resolve(receipts)).rejects.toThrow("fsync unavailable");
    expect(await f.receipts.install(metricEvidencePath("operation.json"), f.original)).toBe("replayed");
  });
  it("refuses an unheld lease and a competing real kernel flock", async () => {
    let saved: (() => void) | undefined;
    await f.receipts.withOperation(async (o) => {
      saved = o.assertHeld;
      await expect(f.receipts.withOperation(async () => {})).rejects.toThrow("fence busy");
      o.assertHeld();
    });
    expect(saved).toBeDefined(); expect(() => saved!()).toThrow();
    expect((await resolve())?.sequence).toBe(0);
  });
  it.each(["file", "directory"])("retains append evidence on actual %s fsync EIO and adopts only after a successful barrier", async (kind) => {
    const name = "batch-0.reserved.json", value = { test: "untrusted receipt; never zero" };
    await f.receipts.withOperation(async (o) => {
      const realSync = fs.fsyncSync;
      const sync = jest.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
        if ((kind === "directory" && fs.fstatSync(fd).isDirectory()) ||
            (kind === "file" && fs.readlinkSync(`/proc/self/fd/${fd}`).endsWith(name))) {
          throw Object.assign(new Error("Injected fsync EIO"), { code: "EIO" });
        }
        realSync(fd);
      });
      await expect(o.install(metricEvidencePath(name), value)).rejects.toThrow("fsync EIO");
      const bytes = readFileSync(path(name));
      await expect(o.read(metricEvidencePath(name))).rejects.toThrow("fsync EIO");
      sync.mockRestore();
      expect(await o.install(metricEvidencePath(name), value)).toBe("replayed");
      expect(readFileSync(path(name))).toEqual(bytes);
    });
    await expect(resolve()).rejects.toThrow("metric_budget_already_started");
  });
});
