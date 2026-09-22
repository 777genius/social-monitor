import { err, tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderValueAssessmentStore } from
  "../contracts/reader-value-assessment-store";
import type { ReaderValueInputBuilder, ReaderValueInventory,
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
    const inventory: ReaderValueInventory = { page: async (
      _scope, _backfillFrom, _cursor, _limit, sourceByteBudget,
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
    } };
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
    const inventory: ReaderValueInventory = { page: async (
      _scope, _from, _cursor, _limit, _sourceByteBudget, exclusivePeriodEnd,
    ) => {
      expect(exclusivePeriodEnd).toBe("2026-09-21T00:00:00.000000Z");
      // An adapter must filter this row in SQL rather than return its large body
      // for the use case to discard after charging the page budget.
      return [];
    } };
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
  const inventory: ReaderValueInventory = { page: async (
    _scope, _from, _cursor, _limit, _sourceByteBudget, exclusivePeriodEnd,
  ) => {
    if (served) return [];
    served = true;
    if (exclusivePeriodEnd !== undefined &&
        row.cursor.publishedAt >= exclusivePeriodEnd) return [];
    return [row];
  } };
  return setupWithInventory(inventory);
};

const setupWithInventory = (inventory: ReaderValueInventory) => {
  const prepare: ReaderValueInputBuilder["prepare"] = () => err("unsafe_source");
  const builder: jest.Mocked<ReaderValueInputBuilder> = {
    prepare: jest.fn(prepare),
  };
  const store: jest.Mocked<Pick<ReaderValueAssessmentStore, "ensure" | "pin">> = {
    ensure: jest.fn(), pin: jest.fn(async () => true),
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
