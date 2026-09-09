import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pairedFixture } from "./reader-summary-new-input-refresh-paired-export.spec-support";
import { RefreshPairedExport } from "./reader-summary-new-input-refresh-paired-export";
import { refreshManifest, refreshNow } from "./reader-summary-new-input-refresh.spec-support";

const parents: string[] = [];
const setup = (options: Parameters<typeof pairedFixture>[0] = {}) => {
  const fixture = pairedFixture(options);
  if (fixture.parent) parents.push(fixture.parent);
  return fixture;
};
const json = (path: string, name: string) => JSON.parse(readFileSync(join(path, name), "utf8"));
afterEach(() => { jest.restoreAllMocks(); for (const path of parents.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("synthetic bounded refresh paired export", () => {
  it("captures same-invocation raw ordered primary and complete supplemental inventory, real grouping and parser bytes with parity", async () => {
    const off = setup({ capture: false });
    const expected = await off.select();
    const on = setup();
    expect(await on.select()).toEqual(expected);
    const result = await on.capture!.finish(true);
    expect(result.failures).toEqual([]);
    expect(result.complete).toBe(true);
    expect(on.feed.readPromotionSnapshot).toHaveBeenCalledTimes(1);
    expect(on.delegate.runTask.mock.calls.map(([{ requestId, correlationId, ...command }]) => command)).toEqual(off.delegate.runTask.mock.calls.map(([{ requestId, correlationId, ...command }]) => command));
    const raw = json(on.path, "inputs.json");
    const promotion = json(on.path, "promotion.json");
    const prep = json(on.path, "preparation.json");
    expect(promotion.primary.map((r: { feedItemId: string }) => r.feedItemId)).toEqual(raw.primaryIds);
    expect(promotion.supplemental.map((r: { feedItemId: string }) => r.feedItemId)).toEqual(raw.supplementalIds);
    expect(raw.supplementalIds).toHaveLength(12);
    expect(prep.admittedSupplemental.length).toBeLessThan(12);
    expect(prep.initialGrouping.clusters.length).toBeGreaterThan(0);
    expect(prep.authoritativeGrouping.clusters.length).toBeGreaterThan(0);
    expect(json(on.path, "rank-command.json").command.limit).toBeGreaterThanOrEqual(120);
    const statuses = json(on.path, "candidate-status.json");
    expect(statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ feedItemId: "promote", status: "model_resolved", decision: "promote" }),
      expect.objectContaining({ feedItemId: "reject", status: "model_resolved", decision: "reject" }),
      expect.objectContaining({ feedItemId: "abstain", status: "model_abstained" }),
      expect.objectContaining({ feedItemId: "hard-gate", status: "deterministic_hard_gate", attempted: false }),
      expect.objectContaining({ feedItemId: "github-0", status: "deterministic_exempt", attempted: false }),
    ]));
    const tape = readFileSync(join(on.path, "models.jsonl"), "utf8");
    expect(tape).toContain('"envelope_verified"');
    expect(tape).toContain('"structuredOutput"');
    expect(tape).toContain('"executionAttestation"');
    expect(tape).toContain('"assessmentBatch":1');
    expect(result.unresolvedCandidateCount).toBe(1);
    expect(json(on.path, "complete.json").experimentComplete).toBe(false);
    for (const name of readdirSync(on.path)) expect(statSync(join(on.path, name)).mode & 0o777).toBe(0o600);
  });

  it("binds real rejected relation requests, validated responses and attestation bytes", async () => {
    const fixture = setup({ relationCase: true });
    await fixture.select();
    const result = await fixture.capture!.finish(true);
    expect(result.failures).toEqual([]);
    expect(result.observationCounts.relationAttempts).toBeGreaterThan(0);
    const tape = readFileSync(join(fixture.path, "relations.jsonl"), "utf8");
    expect(tape).toContain('"sameStory":false');
    expect(tape).toContain('"status":"validated"');
    expect(readFileSync(join(fixture.path, "models.jsonl"), "utf8")).toContain('"relationId":1');
  });

  it("retains genuine budget pending beyond 200 rather than calling eligibility completion", async () => {
    const fixture = setup({ extra: 200, supplemental: 0 });
    await fixture.select();
    const result = await fixture.capture!.finish(true);
    expect(result.failures).toEqual([]);
    const statuses = json(fixture.path, "candidate-status.json");
    expect(statuses.filter((s: { attempted: boolean }) => s.attempted)).toHaveLength(200);
    expect(statuses.filter((s: { status: string }) => s.status === "pending").length).toBe(3);
    expect(fixture.delegate.runTask.mock.calls.filter(([c]) => c.purpose.includes("assess_source_content"))).toHaveLength(25);
  });

  it("refuses absent swallowed P1 callback and keeps capture failures separate from selection", async () => {
    const fixture = setup({ omitPreparation: true });
    await expect(fixture.select()).resolves.toBeDefined();
    expect((await fixture.capture!.finish(true)).complete).toBe(false);
    expect(existsSync(join(fixture.path, "complete.json"))).toBe(false);
  });

  it("detects tampering before completion even if edited JSON remains well formed", async () => {
    const fixture = setup();
    await fixture.select();
    const raw = json(fixture.path, "inputs.json");
    raw.snapshot.sourceContent[0].body = "synthetic altered body";
    writeFileSync(join(fixture.path, "inputs.json"), JSON.stringify(raw) + "\n");
    expect((await fixture.capture!.finish(true)).failures).toContain("sidecar_integrity_failed");
    expect(existsSync(join(fixture.path, "complete.json"))).toBe(false);
  });

  it("does not retry or change selection when a create-only sidecar cannot be written", async () => {
    const fixture = setup();
    mkdirSync(join(fixture.path, "promotion.json"));
    await expect(fixture.select()).resolves.toBeDefined();
    const result = await fixture.capture!.finish(true);
    expect(result.failures).toContain("promotion_observer_failed");
    expect(result.complete).toBe(false);
    expect(fixture.feed.readPromotionSnapshot).toHaveBeenCalledTimes(1);
    expect(fixture.delegate.runTask.mock.calls.filter(([c]) => c.purpose.includes("assess_source_content"))).toHaveLength(1);
  });

  it("never reuses a duplicate capture path or seals a partial run", async () => {
    const fixture = setup();
    const duplicate = new RefreshPairedExport(fixture.path, refreshManifest(), () => refreshNow.getTime());
    expect((await duplicate.finish(false)).failures).toContain("initialization_failed");
    expect((await fixture.capture!.finish(false)).complete).toBe(false);
    expect(existsSync(join(fixture.path, "complete.json"))).toBe(false);
  });

  it("withdraws completion when durability fails after the atomic link", async () => {
    const fixture = setup();
    await fixture.select();
    const fs = jest.requireActual<typeof import("node:fs")>("node:fs");
    const sync = fs.fsyncSync;
    jest.spyOn(fs, "fsyncSync").mockImplementation((fd) => {
      if (existsSync(join(fixture.path, "complete.json")) && fs.fstatSync(fd).isDirectory()) throw new Error("Synthetic directory sync failure");
      sync(fd);
    });
    expect((await fixture.capture!.finish(true)).failures).toContain("manifest_write_failed");
    expect(existsSync(join(fixture.path, "complete.json"))).toBe(false);
  });

  it("keeps a pending relation incomplete and retains its already consumed late terminal", async () => {
    const fixture = setup();
    await fixture.select();
    const id = fixture.capture!.relationStart({ synthetic: true });
    expect((await fixture.capture!.finish(true)).failures).toContain("relation_in_flight");
    fixture.capture!.relationEnd(id, { status: "aborted" });
    expect(readFileSync(join(fixture.path, "relations.jsonl"), "utf8")).toContain('"status":"aborted"');
    expect(existsSync(join(fixture.path, "complete.json"))).toBe(false);
  });

  it("fails cross-scope raw joins while returning unchanged data to the producer", async () => {
    const fixture = setup();
    const query = { ...fixture.query, tenantId: "other" };
    const port = fixture.capture!.feed(fixture.feed);
    await expect(port.readPromotionSnapshot({ ...query, timestampPolicy: "published_at",
      windowStartedAt: query.period.startedAt, windowEndedAt: query.period.endedAt,
      observedThrough: query.observedThrough } as never)).resolves.toBe(fixture.raw);
    expect((await fixture.capture!.finish(false)).failures).toContain("snapshot_capture_failed");
  });

  it("retains malformed parser failures without certifying completion or retrying", async () => {
    const fixture = setup({ response: () => ({ reviews: [] }) });
    await fixture.select().catch(() => undefined);
    const result = await fixture.capture!.finish(false);
    expect(result.complete).toBe(false);
    expect(readFileSync(join(fixture.path, "assessments.jsonl"), "utf8")).toContain('"phase":"failed"');
    expect(fixture.delegate.runTask).toHaveBeenCalledTimes(1);
  });
});
