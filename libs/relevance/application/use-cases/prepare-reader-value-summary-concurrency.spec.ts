import { tenantId, workspaceId, type Clock } from "@social-monitor/shared-kernel";

import type { ReaderValueAssessmentStore, ReaderValuePreparedInput } from
  "../contracts/reader-value-assessment-store";
import type { ReaderValueInventoryItem, ReaderValuePreparationInventory } from
  "../contracts/reader-value-inventory";
import type { ConfiguredInterestReaderPort } from "../../ports";
import { SourceContentSafetyPolicy } from "../../domain/source-content-safety";
import { readerValueSha256 } from "../../domain/reader-value/reader-value-config";
import { ConservativeReaderValueInputBuilder } from
  "../../infrastructure/reader-value/reader-value-input-builder";
import { PrepareReaderValueSummaryUseCase } from "./prepare-reader-value-summary.use-case";

describe("reader value preparation independent assessment persistence", () => {
  afterEach(() => jest.useRealTimers());

  // Regression: serial 2s transactions for 80 cached inputs exceed the unchanged
  // 110s deadline. Four independent transactions finish in 40s after snapshot close.
  it("bounds independent transactions at four while finishing within the original budget", async () => {
    jest.useFakeTimers({ now: Date.parse(cutoffAt) });
    const fixture = setup(80, { now: () => new Date() });
    let active = 0;
    let maximumActive = 0;
    fixture.store.ensure.mockImplementation(async (id, input) => {
      expect(fixture.snapshotOpen()).toBe(false);
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      active -= 1;
      return assessment(id, input);
    });
    const result = fixture.prepare({
      deadlineAt: new Date(Date.parse(cutoffAt) + 110_000).toISOString(),
    });
    await jest.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ ok: true,
      manifest: { candidates: expect.any(Array) } });
    expect(maximumActive).toBe(4);
    expect(active).toBe(0);
    expect(Date.now() - Date.parse(cutoffAt)).toBe(40_000);
    expect(fixture.store.ensure).toHaveBeenCalledTimes(80);
    expect(fixture.store.pin).toHaveBeenCalledTimes(1);
  });

  it("keeps assessment identities, canonical ordering and hash stable across completion orders", async () => {
    const run = async (reverse: boolean) => {
      const fixture = setup(8);
      const releases: Array<() => void> = [];
      fixture.store.ensure.mockImplementation(async (id, input) => {
        expect(fixture.snapshotOpen()).toBe(false);
        await new Promise<void>((resolve) => releases.push(resolve));
        return assessment(id, input);
      });
      const pending = fixture.prepare();
      await flush();
      expect(releases).toHaveLength(4);
      for (let offset = 0; offset < 8; offset += 4) {
        const batch = releases.slice(offset, offset + 4);
        for (const release of reverse ? batch.reverse() : batch) release();
        await flush();
      }
      const result = await pending;
      if (!result.ok) throw new Error(result.code);
      expect(result.manifest.candidates.map((candidate) => candidate.candidateId))
        .toEqual(Array.from({ length: 8 }, (_, index) => uuid(index + 100)));
      for (const [index, candidate] of [...result.manifest.candidates].reverse().entries()) {
        expect(candidate.assessmentId).toBe(uuid(index + 1_000));
      }
      expect(result.manifestSha256).toBe(readerValueSha256(JSON.stringify(result.manifest)));
      expect(fixture.store.pin.mock.calls[0]?.[3]).toEqual(result.manifest.candidates.map(
        (candidate) => ({ assessmentId: candidate.assessmentId,
          feedItemId: candidate.candidateId, sourceBindingId: candidate.sourceBindingId,
          sourceSnapshotSha256: candidate.sourceSnapshotSha256,
          inputSha256: candidate.inputSha256 })));
      return result;
    };
    expect(await run(true)).toEqual(await run(false));
  });

  it.each(["missing", "exception"] as const)(
    "drains every in-flight ensure before reporting a %s failure and never pins a partial batch",
    async (failure) => {
      const fixture = setup(8);
      const releases: Array<() => void> = [];
      const error = new Error("assessment persistence failed");
      fixture.store.ensure.mockImplementation(async (id, input) => {
        const ordinal = releases.length;
        await new Promise<void>((resolve) => releases.push(resolve));
        if (ordinal === 0) {
          if (failure === "exception") throw error;
          return null;
        }
        return assessment(id, input);
      });
      let finished = false;
      const pending = fixture.prepare().then((value) => ({ value }), (error: unknown) =>
        ({ error })).finally(() => { finished = true; });
      await flush();
      expect(releases).toHaveLength(4);
      releases[0]!();
      await flush();
      expect(finished).toBe(false);
      expect(fixture.store.pin).not.toHaveBeenCalled();
      releases.slice(1).forEach((release) => release());
      const result = await pending;
      expect(result).toEqual(failure === "exception" ? { error } : {
        value: { ok: false, code: "assessment_snapshot_unavailable" },
      });
      expect(fixture.store.ensure).toHaveBeenCalledTimes(4);
      expect(fixture.store.pin).not.toHaveBeenCalled();
    });

  it("drains a deadline-expired batch without starting more work or pinning", async () => {
    let now = Date.parse(cutoffAt);
    const fixture = setup(8, { now: () => new Date(now) });
    const releases: Array<() => void> = [];
    fixture.store.ensure.mockImplementation(async (id, input) => {
      await new Promise<void>((resolve) => releases.push(resolve));
      return assessment(id, input);
    });
    let finished = false;
    const pending = fixture.prepare({ deadlineAt: new Date(now + 110_000).toISOString() })
      .finally(() => { finished = true; });
    await flush();
    expect(releases).toHaveLength(4);
    now += 110_000;
    releases[0]!();
    await flush();
    expect(finished).toBe(false);
    releases.slice(1).forEach((release) => release());

    await expect(pending).resolves.toEqual({ ok: false, code: "assessment_time_over_budget" });
    expect(fixture.store.ensure).toHaveBeenCalledTimes(4);
    expect(fixture.store.pin).not.toHaveBeenCalled();
  });
});

const cutoffAt = "2026-10-19T00:00:00.000000Z";
const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const scope = { tenantId: uuid(1), workspaceId: uuid(2), interestId: uuid(3) };
const assessment = (id: string, input: ReaderValuePreparedInput) => ({ id, input }) as
  Awaited<ReturnType<ReaderValueAssessmentStore["ensure"]>>;
const flush = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };

const setup = (count: number, clock?: Clock) => {
  const rows: ReaderValueInventoryItem[] = Array.from({ length: count }, (_, index) => ({
    cursor: { publishedAt: "2026-10-18T12:00:00.000000Z", feedItemId: uuid(99 + count - index) },
    sourceBindingId: uuid(4), observedAt: "2026-10-18T12:00:00.000000Z",
    sourceUpdatedAt: "2026-10-18T12:00:00.000000Z", sourceRevisionKey: `revision-${index}`,
    metadata: { kind: "rss_item" },
    source: { ...scope, sourceItemId: uuid(index + 200), providerKey: "rss",
      canonicalUrl: `https://example.test/item/${index}`, title: "Title", body: "Body",
      interest: "database methods", availableAt: "2026-10-18T12:00:00.000000Z",
      capture: { representationVersion: "capture.v1", availability: "complete", segments: [] } },
  }));
  let open = false;
  let offset = 0;
  const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) => {
    open = true;
    try {
      return await operation({ page: async () => {
        const page = rows.slice(offset, offset + 25);
        offset += 25;
        return page;
      } });
    } finally { open = false; }
  } };
  const pin: ReaderValueAssessmentStore["pin"] = async () => {
    expect(open).toBe(false);
    return true;
  };
  const store: jest.Mocked<Pick<ReaderValueAssessmentStore, "ensure" | "pin">> = {
    ensure: jest.fn(), pin: jest.fn(pin),
  };
  const interests: ConfiguredInterestReaderPort = { readCurrent: async () => ({
    kind: "available", interest: { tenantId: tenantId(scope.tenantId),
      workspaceId: workspaceId(scope.workspaceId), interestId: scope.interestId,
      query: "database methods" },
  }) };
  let nextId = 1_000;
  const subject = new PrepareReaderValueSummaryUseCase(inventory,
    new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy()),
    store, { generate: () => uuid(nextId++) }, interests, clock);
  return { store, snapshotOpen: () => open, prepare: async (overrides: { deadlineAt?: string } = {}) => {
    const command = { ...scope, jobId: uuid(5), periodStartedAt: "2026-10-12T00:00:00.000000Z",
      periodEndedAt: cutoffAt, cutoffAt, ...overrides };
    const configuration = await subject.configuration(command);
    if (!configuration.ok) throw new Error("fixture configuration unavailable");
    return subject.prepare(command, configuration.config);
  } };
};
