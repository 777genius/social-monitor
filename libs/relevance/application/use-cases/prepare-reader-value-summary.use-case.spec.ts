import { err, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderValueAssessmentStore } from
  "../contracts/reader-value-assessment-store";
import type { ReaderValueInputBuilder, ReaderValuePreparationInventory,
  ReaderValueInventoryItem } from "../contracts/reader-value-inventory";
import { ReaderValueInventoryByteCeilingExceeded } from
  "../contracts/reader-value-inventory";
import type { ConfiguredInterestReaderPort } from "../../ports";
import { PrepareReaderValueSummaryUseCase } from
  "./prepare-reader-value-summary.use-case";
import { ConservativeReaderValueInputBuilder } from
  "../../infrastructure/reader-value/reader-value-input-builder";
import { SourceContentSafetyPolicy } from "../../domain/source-content-safety";

describe("PrepareReaderValueSummaryUseCase timestamp cutoffs", () => {
  it.each([
    ["day", "2026-09-20T00:00:00.000Z", "2026-09-21T00:00:00.000Z"],
    ["week", "2026-09-14T00:00:00.000Z", "2026-09-21T00:00:00.000Z"],
    ["month", "2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"],
  ] as const)("prepares a default current %s V3 request at frozen requestedAt",
    async (_cadence, periodStartedAt, periodEndedAt) => {
      const requestedAt = new Date("2026-09-20T12:00:00.123Z");
      const cutoffAt = requestedAt.toISOString().replace(/\.(\d{3})Z$/u, ".$1000Z");
      const row = item({ publishedAt: cutoffAt, observedAt: cutoffAt,
        sourceUpdatedAt: cutoffAt, availableAt: cutoffAt });
      const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
        operation({ page: async (from, _cursor, _limit, _budget, end) => {
          expect(from).toBe(periodStartedAt);
          expect(end).toBe("2026-09-20T12:00:00.123001Z");
          return [row];
        } }) };
      const fixture = setupWithInventory(inventory);
      const actual = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
      fixture.builder.prepare.mockImplementation((source, revision) => actual.prepare(source, revision));
      fixture.store.ensure.mockResolvedValue({ id: ids.assessment } as never);
      const command = { tenantId: ids.tenant, workspaceId: ids.workspace,
        interestId: ids.interest, jobId: ids.job,
        periodStartedAt, periodEndedAt, cutoffAt };

      const configured = await fixture.subject.configuration(command);
      expect(configured.ok).toBe(true);
      if (!configured.ok) throw new Error("current-period configuration unavailable");
      const result = await fixture.subject.prepare(command, configured.config);

      expect(result).toMatchObject({ ok: true, manifest: { cutoffAt,
        candidates: [{ candidateId: ids.feed, publishedAt: cutoffAt,
          observedAt: cutoffAt }] } });
      expect(fixture.store.ensure).toHaveBeenCalledTimes(1);
      expect(fixture.store.pin).toHaveBeenCalledTimes(1);
    });

  it("rejects a wholly future period before V3 preparation", async () => {
    const fixture = setup(item({}));
    const valid = { tenantId: ids.tenant, workspaceId: ids.workspace,
      interestId: ids.interest, jobId: ids.job,
      periodStartedAt: "2026-09-20T00:00:00.000Z",
      periodEndedAt: "2026-09-21T00:00:00.000Z",
      cutoffAt: "2026-09-20T12:00:00.000Z" };
    const configured = await fixture.subject.configuration(valid);
    if (!configured.ok) throw new Error("fixture configuration unavailable");
    const future = { ...valid, periodStartedAt: "2026-09-21T00:00:00.000Z",
      periodEndedAt: "2026-09-22T00:00:00.000Z" };

    await expect(fixture.subject.configuration(future)).resolves.toEqual({
      ok: false, code: "config_unavailable",
    });
    await expect(fixture.subject.prepare(future, configured.config)).resolves.toEqual({
      ok: false, code: "config_unavailable",
    });
    await expect(fixture.subject.configuration({ ...valid,
      periodEndedAt: valid.periodStartedAt })).resolves.toEqual({
      ok: false, code: "config_unavailable",
    });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
    expect(fixture.store.pin).not.toHaveBeenCalled();
  });

  it("does not prepare a row published after an active-period cutoff", async () => {
    const row = item({ publishedAt: "2026-09-20T12:00:00.123457Z",
      observedAt: "2026-09-20T11:00:00.000000Z",
      sourceUpdatedAt: "2026-09-20T11:00:00.000000Z",
      availableAt: "2026-09-20T11:00:00.000000Z" });
    const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
      operation({ page: async (_from, _cursor, _limit, _budget, end) => {
        expect(end).toBe("2026-09-20T12:00:00.123457Z");
        return [row];
      } }) };
    const fixture = setupWithInventory(inventory);
    const command = { tenantId: ids.tenant, workspaceId: ids.workspace,
      interestId: ids.interest, jobId: ids.job,
      periodStartedAt: "2026-09-20T00:00:00.000000Z",
      periodEndedAt: "2026-09-21T00:00:00.000000Z",
      cutoffAt: "2026-09-20T12:00:00.123456Z" };
    const configured = await fixture.subject.configuration(command);
    if (!configured.ok) throw new Error("fixture configuration unavailable");

    await expect(fixture.subject.prepare(command, configured.config)).resolves.toMatchObject({
      ok: true, manifest: { candidates: [] },
    });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });

  it("keeps one 32 MiB materialization budget across skipped pages", async () => {
    const body = "x".repeat(700_000);
    const pages = [0, 1].map((page) => Array.from({ length: 25 }, (_, index) => ({
      ...item({ observedAt: "2026-09-21T00:00:00.000001Z" }),
      cursor: { publishedAt: `2026-09-20T23:59:${String(page * 25 + index)
        .padStart(2, "0")}.000000Z`, feedItemId:
        `00000000-0000-4000-8000-${String(page * 25 + index + 100)
          .padStart(12, "0")}` },
      source: { ...item({}).source, title: "", body },
    })));
    const budgets: number[] = [];
    let pageIndex = 0;
    const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
      operation({ page: async (
        _backfillFrom, _cursor, _limit, sourceByteBudget,
      ) => {
        if (sourceByteBudget === undefined) {
          throw new Error("summary preparation must pass the remaining byte budget");
        }
        budgets.push(sourceByteBudget);
        const page = pages[pageIndex++] ?? [];
        const bytes = page.reduce((sum, row) => sum +
          Buffer.byteLength(row.source.title) + Buffer.byteLength(row.source.body), 0);
        if (bytes > sourceByteBudget) {
          throw new ReaderValueInventoryByteCeilingExceeded();
        }
        return page;
      } }) };
    const fixture = setupWithInventory(inventory);

    await expect(prepare(fixture.subject)).resolves.toEqual({
      ok: false,
      code: "assessment_inventory_over_budget",
    });
    expect(budgets).toEqual([32 * 1024 * 1024, 32 * 1024 * 1024 - 17_500_000]);
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });
  it("excludes the exact end-of-window row before assessment preparation", async () => {
    const fixture = setup(item({ publishedAt: "2026-09-21T00:00:00.000000Z" }));
    const result = await prepare(fixture.subject);

    expect(result).toMatchObject({ ok: true, manifest: { candidates: [] } });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });

  it("passes the exclusive period end to inventory before source bytes are materialized", async () => {
    const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
      operation({ page: async (
        _from, _cursor, _limit, _sourceByteBudget, exclusivePeriodEnd,
      ) => {
        expect(exclusivePeriodEnd).toBe("2026-09-21T00:00:00.000000Z");
        // An adapter must filter this row in SQL rather than return its large body
        // for the use case to discard after charging the page budget.
        return [];
      } }) };
    const fixture = setupWithInventory(inventory);

    await expect(prepare(fixture.subject)).resolves.toMatchObject({ ok: true });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });

  it("persists supported empty input before an unavailable historical snapshot", async () => {
    const fixture = setup(item({ availableAt: null,
      sourceUpdatedAt: "2026-09-21T00:00:00.000001Z", title: "", body: "" }));
    const actual = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
    fixture.builder.prepare.mockImplementation((source, revision) => actual.prepare(source, revision));
    fixture.store.ensure.mockResolvedValue({ id: ids.assessment } as never);

    await expect(prepare(fixture.subject)).resolves.toMatchObject({
      ok: true, manifest: { candidates: [] },
    });
    expect(fixture.store.ensure).toHaveBeenCalledTimes(1);
    expect(fixture.builder.prepare.mock.results[0]?.value).toMatchObject({
      value: { terminalFailure: "empty_input" },
    });
  });

  it("accepts a frozen configuration hydrated from JSONB in a different key order", async () => {
    const fixture = setup(item({}));
    const actual = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
    fixture.builder.prepare.mockImplementation((source, revision) => actual.prepare(source, revision));
    fixture.store.ensure.mockResolvedValue({ id: ids.assessment } as never);
    const command = { tenantId: ids.tenant, workspaceId: ids.workspace,
      interestId: ids.interest, jobId: ids.job,
      periodStartedAt: "2026-09-20T00:00:00.000000Z",
      periodEndedAt: "2026-09-21T00:00:00.000000Z",
      cutoffAt: "2026-09-21T00:00:00.000000Z" };
    const configured = await fixture.subject.configuration(command);
    if (!configured.ok) throw new Error("fixture configuration unavailable");
    const hydrated: typeof configured.config = {
      modelConfigVersion: configured.config.modelConfigVersion,
      inputBuilderVersion: configured.config.inputBuilderVersion,
      rubricSha256: configured.config.rubricSha256,
      rubricVersion: configured.config.rubricVersion,
      interestSha256: configured.config.interestSha256,
      interestId: configured.config.interestId,
      schemaVersion: configured.config.schemaVersion,
    };

    await expect(fixture.subject.prepare(command, hydrated)).resolves.toMatchObject({ ok: true });
    expect(fixture.builder.prepare).toHaveBeenCalledTimes(1);
  });

  it("rejects a source revision one microsecond after the frozen cutoff", async () => {
    const fixture = setup(item({ sourceUpdatedAt: "2026-09-21T00:00:00.000001Z" }));
    const result = await prepare(fixture.subject);

    expect(result).toEqual({ ok: false, code: "assessment_snapshot_unavailable" });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });

  it("excludes a pre-existing source projected one microsecond after cutoff", async () => {
    const fixture = setup(item({
      observedAt: "2026-09-21T00:00:00.000001Z",
      sourceUpdatedAt: "2026-09-20T23:59:59.999999Z",
    }));

    await expect(prepare(fixture.subject)).resolves.toMatchObject({
      ok: true,
      manifest: { candidates: [] },
    });
    expect(fixture.builder.prepare).not.toHaveBeenCalled();
  });

  it("admits a FeedItem observed exactly on the frozen cutoff boundary", async () => {
    const fixture = setup(item({ observedAt: "2026-09-21T00:00:00.000000Z" }));

    await expect(prepare(fixture.subject)).resolves.toMatchObject({ ok: true });
    expect(fixture.builder.prepare).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["2026-09-21T00:00:00.123456Z", true],
    ["2026-09-21T00:00:00.123457Z", false],
  ] as const)("compares %s against a .123456Z cutoff without millisecond truncation",
    async (observedAt, included) => {
      const fixture = setup(item({ observedAt,
        sourceUpdatedAt: "2026-09-21T00:00:00.123456Z" }));

      await prepare(fixture.subject, "2026-09-21T00:00:00.123456Z");

      expect(fixture.builder.prepare).toHaveBeenCalledTimes(included ? 1 : 0);
    });

  it("finishes every snapshot page before persisting assessments and pins", async () => {
    const rows = Array.from({ length: 26 }, (_, index) => ({
      ...item({ publishedAt: `2026-09-20T23:59:${String(index).padStart(2, "0")}.000000Z` }),
      cursor: { publishedAt: `2026-09-20T23:59:${String(index).padStart(2, "0")}.000000Z`,
        feedItemId: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}` },
    }));
    let snapshotOpen = false;
    let pageIndex = 0;
    const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) => {
      snapshotOpen = true;
      try {
        return await operation({ page: async () => pageIndex++ === 0 ? rows.slice(0, 25) : rows.slice(25) });
      } finally {
        snapshotOpen = false;
      }
    } };
    const fixture = setupWithInventory(inventory);
    const actual = new ConservativeReaderValueInputBuilder(new SourceContentSafetyPolicy());
    fixture.builder.prepare.mockImplementation((source, revision) => actual.prepare(source, revision));
    fixture.store.ensure.mockImplementation(async () => {
      expect(snapshotOpen).toBe(false);
      return { id: ids.assessment } as never;
    });
    fixture.store.pin.mockImplementation(async () => {
      expect(snapshotOpen).toBe(false);
      return true;
    });

    await expect(prepare(fixture.subject)).resolves.toMatchObject({
      ok: true, manifest: { candidates: expect.any(Array) },
    });
    expect(fixture.store.ensure).toHaveBeenCalledTimes(26);
    expect(fixture.store.pin).toHaveBeenCalledTimes(1);
  });
});

const prepare = async (subject: PrepareReaderValueSummaryUseCase,
  cutoffAt = "2026-09-21T00:00:00.000000Z") => {
  const command = { tenantId: ids.tenant, workspaceId: ids.workspace,
    interestId: ids.interest, jobId: ids.job,
    periodStartedAt: "2026-09-20T00:00:00.000000Z",
    periodEndedAt: "2026-09-21T00:00:00.000000Z",
    cutoffAt };
  const configuration = await subject.configuration(command);
  if (!configuration.ok) throw new Error("fixture configuration unavailable");
  return subject.prepare(command, configuration.config);
};

const setup = (row: ReaderValueInventoryItem) => {
  let served = false;
  const inventory: ReaderValuePreparationInventory = { readSnapshot: async (_scope, operation) =>
    operation({ page: async (
      _from, _cursor, _limit, _sourceByteBudget, exclusivePeriodEnd,
    ) => {
      if (served) return [];
      served = true;
      if (exclusivePeriodEnd !== undefined &&
          row.cursor.publishedAt >= exclusivePeriodEnd) return [];
      return [row];
    } }) };
  return setupWithInventory(inventory);
};

const setupWithInventory = (inventory: ReaderValuePreparationInventory) => {
  const prepare: ReaderValueInputBuilder["prepare"] = () => err("unsafe_source");
  const builder: jest.Mocked<ReaderValueInputBuilder> = {
    prepare: jest.fn(prepare),
  };
  const pin: ReaderValueAssessmentStore["pin"] = async (
    scope, interestId, jobId, references,
  ) => {
    void scope;
    void interestId;
    void jobId;
    void references;
    return true;
  };
  const store: jest.Mocked<Pick<ReaderValueAssessmentStore, "ensure" | "pin">> = {
    ensure: jest.fn(), pin: jest.fn(pin),
  };
  const interests: ConfiguredInterestReaderPort = { readCurrent: async () => ({
    kind: "available", interest: { tenantId: tenantId(ids.tenant),
      workspaceId: workspaceId(ids.workspace), interestId: ids.interest,
      query: "database methods" },
  }) };
  return { builder, store, subject: new PrepareReaderValueSummaryUseCase(inventory,
    builder, store, { generate: () => ids.assessment }, interests) };
};

const item = (overrides: { readonly publishedAt?: string;
  readonly observedAt?: string; readonly sourceUpdatedAt?: string;
  readonly availableAt?: string | null; readonly title?: string; readonly body?: string }):
ReaderValueInventoryItem => ({
  cursor: { publishedAt: overrides.publishedAt ??
    "2026-09-20T23:59:59.999999Z", feedItemId: ids.feed },
  sourceBindingId: ids.binding, observedAt: overrides.observedAt ??
    "2026-09-20T23:59:59.000000Z",
  sourceUpdatedAt: overrides.sourceUpdatedAt ?? "2026-09-20T23:59:59.999999Z",
  sourceRevisionKey: "revision", metadata: { kind: "rss_item" },
  source: { tenantId: ids.tenant, workspaceId: ids.workspace,
    interestId: ids.interest, sourceItemId: ids.source, providerKey: "rss",
    canonicalUrl: "https://example.test/item", title: overrides.title ?? "Title", body: overrides.body ?? "Body",
    interest: "database methods",
    availableAt: overrides.availableAt === undefined ? "2026-09-20T23:59:59.999999Z" : overrides.availableAt,
    capture: { representationVersion: "capture.v1", availability: "complete",
      segments: [] } },
});

const ids = { tenant: "00000000-0000-4000-8000-000000000001",
  workspace: "00000000-0000-4000-8000-000000000002",
  interest: "00000000-0000-4000-8000-000000000003",
  job: "00000000-0000-4000-8000-000000000004",
  feed: "00000000-0000-4000-8000-000000000005",
  binding: "00000000-0000-4000-8000-000000000006",
  source: "00000000-0000-4000-8000-000000000007",
  assessment: "00000000-0000-4000-8000-000000000008" };
