import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildReaderSummaryDayDatasetManifest,
  captureReaderSummaryDayDatasetManifest,
  manifestsMatch,
} from "./reader-summary-day-dataset-manifest";
import {
  DatasetGuardedReaderSummaryEvidenceSelector,
  ReaderSummaryDayDatasetGuard,
  completeDatasetGuardPhases,
  readReaderSummaryDayDatasetManifest,
} from "./reader-summary-day-dataset-guard";

const scope = {
  tenantId: "33333333-3333-4333-8333-333333333333",
  workspaceId: "44444444-4444-4444-8444-444444444444",
  startedAt: new Date("2026-07-19T00:00:00.000Z"),
  endedAt: new Date("2026-07-20T00:00:00.000Z"),
  generatedAt: new Date("2026-07-20T00:05:00.000Z"),
};

describe("reader summary day dataset manifest", () => {
  it("is deterministic for the same ordered production rows", () => {
    const first = manifest();
    const second = manifest();

    expect(second).toEqual(first);
    expect(manifestsMatch(first, second)).toBe(true);
    expect(first.policy.timestampPolicy).toBe("published_at");
  });

  it("binds observed_at into the manifest identity and database window", async () => {
    const published = manifest();
    const observed = manifest({ timestampPolicy: "observed_at" });
    expect(observed.dataset.aggregateSha256).not.toBe(
      published.dataset.aggregateSha256,
    );
    expect(manifestsMatch(published, observed)).toBe(false);

    const query = jest
      .fn()
      .mockResolvedValueOnce([
        row("hacker-news", "observed inside"),
        row("reddit", "observed inside"),
      ])
      .mockResolvedValueOnce([]);
    const captured = await captureReaderSummaryDayDatasetManifest({
      client: { $queryRaw: query as never },
      ...scope,
      timestampPolicy: "observed_at",
    });
    expect(query.mock.calls[0]).toContain("observed_at");
    expect(captured.dataset.providerCounts).toEqual({
      "hacker-news": 1,
      reddit: 1,
    });
  });

  it("changes the aggregate digest when evidence content changes", () => {
    const original = manifest();
    const changed = manifest({ feedRows: [row("reddit", "changed body")] });

    expect(changed.dataset.aggregateSha256).not.toBe(
      original.dataset.aggregateSha256,
    );
    expect(manifestsMatch(original, changed)).toBe(false);
  });

  it("changes the aggregate digest when GitHub eligibility changes", () => {
    const original = manifest();
    const changed = manifest({
      eligibilityRows: [{ rowJson: '{"binding":"disabled"}' }],
    });

    expect(changed.dataset.aggregateSha256).not.toBe(
      original.dataset.aggregateSha256,
    );
  });

  it("persists hashes and counts without raw row content", () => {
    const rawMarker = "private-provider-payload-marker";
    const value = manifest({ feedRows: [row("reddit", rawMarker)] });

    expect(JSON.stringify(value)).not.toContain(rawMarker);
    expect(value.redaction).toEqual({
      rawContentPersisted: false,
      rawProviderPayloadPersisted: false,
      secretsIncluded: false,
    });
  });

  it("records all four guard phases once and in order", async () => {
    const expected = manifest();
    const client = lockCapableQueryClient();
    const guard = new ReaderSummaryDayDatasetGuard(
      client as never,
      expected,
      "f".repeat(64),
      () => new Date("2026-07-20T00:06:00.000Z"),
    );

    await guard.assertCurrent("before_evidence_selection");
    await guard.assertCurrent("after_evidence_selection");
    await guard.assertCurrentForPublicationTransaction(client as never);
    await guard.assertCurrentForPublicationTransaction(client as never);

    expect(guard.evidence()).toMatchObject({
      manifestFileSha256: "f".repeat(64),
      completedPhases: completeDatasetGuardPhases,
    });
    expect(client.$executeRaw).toHaveBeenCalledTimes(2);
    await expect(
      guard.assertCurrent("before_evidence_selection"),
    ).rejects.toThrow("out of order");
  });

  it("fails closed when guarded publication has no transaction table-lock primitive", async () => {
    const guard = new ReaderSummaryDayDatasetGuard(
      queryClient(),
      manifest(),
      "f".repeat(64),
      () => new Date("2026-07-20T00:06:00.000Z"),
    );
    await guard.assertCurrent("before_evidence_selection");
    await guard.assertCurrent("after_evidence_selection");

    await expect(
      guard.assertCurrentForPublicationTransaction(queryClient() as never),
    ).rejects.toThrow("lock-capable Prisma transaction");
  });

  it("keeps the committed manifest proof valid after later dataset changes", async () => {
    let changed = false;
    const client = {
      $queryRaw: queryRaw(() => changed),
      $executeRaw: jest.fn(async () => 0),
    };
    const guard = new ReaderSummaryDayDatasetGuard(
      client as never,
      manifest(),
      "f".repeat(64),
      () => new Date("2026-07-20T00:06:00.000Z"),
    );

    await guard.assertCurrent("before_evidence_selection");
    await guard.assertCurrent("after_evidence_selection");
    await guard.assertCurrentForPublicationTransaction(client as never);
    const queryCountAtCommit = client.$queryRaw.mock.calls.length;
    changed = true;

    expect(guard.evidence().completedPhases).toEqual(
      completeDatasetGuardPhases,
    );
    expect(client.$queryRaw).toHaveBeenCalledTimes(queryCountAtCommit);
  });

  it("fails closed when the database snapshot changes", async () => {
    const expected = manifest();
    const client = queryClient(true);
    const guard = new ReaderSummaryDayDatasetGuard(
      client,
      expected,
      "f".repeat(64),
      () => new Date("2026-07-20T00:06:00.000Z"),
    );

    await expect(
      guard.assertCurrent("before_evidence_selection"),
    ).rejects.toThrow("dataset changed");
  });

  it("rejects a mixed evidence policy before selection", async () => {
    const delegate = { select: jest.fn() };
    const selector = new DatasetGuardedReaderSummaryEvidenceSelector(
      delegate as never,
      new ReaderSummaryDayDatasetGuard(
        queryClient(),
        manifest({ timestampPolicy: "observed_at" }),
        "f".repeat(64),
        () => new Date("2026-07-20T00:06:00.000Z"),
      ),
    );

    await expect(
      selector.select({
        tenantId: scope.tenantId as never,
        workspaceId: scope.workspaceId as never,
        scope: { type: "workspace" },
        period: {
          cadence: "daily",
          startedAt: scope.startedAt,
          endedAt: scope.endedAt,
          timezone: "UTC",
          periodKey: "test-period",
        },
        maxItems: 10,
        timestampPolicy: "published_at",
      }),
    ).rejects.toThrow("does not match dataset manifest");
    expect(delegate.select).not.toHaveBeenCalled();
  });

  it("validates manifest hash, scope, date and freshness", () => {
    const directory = mkdtempSync(join(tmpdir(), "summary-manifest-"));
    const path = join(directory, "manifest.json");
    try {
      writeFileSync(path, `${JSON.stringify(manifest())}\n`);
      chmodSync(path, 0o400);
      const sha256 = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
      expect(
        readReaderSummaryDayDatasetManifest({
          path,
          expectedFileSha256: sha256,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          startedAt: scope.startedAt,
          endedAt: scope.endedAt,
          now: new Date("2026-07-20T00:10:00.000Z"),
        }).fileSha256,
      ).toBe(sha256);
      expect(() =>
        readReaderSummaryDayDatasetManifest({
          path,
          expectedFileSha256: "0".repeat(64),
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          startedAt: scope.startedAt,
          endedAt: scope.endedAt,
          now: new Date("2026-07-20T00:10:00.000Z"),
        }),
      ).toThrow("file hash does not match");
      for (const invalid of [
        { tenantId: "55555555-5555-4555-8555-555555555555" },
        { startedAt: new Date("2026-07-18T00:00:00.000Z") },
        { now: new Date("2026-07-20T00:40:01.000Z") },
      ]) {
        expect(() =>
          readReaderSummaryDayDatasetManifest({
            path,
            expectedFileSha256: sha256,
            tenantId: scope.tenantId,
            workspaceId: scope.workspaceId,
            startedAt: scope.startedAt,
            endedAt: scope.endedAt,
            now: new Date("2026-07-20T00:10:00.000Z"),
            ...invalid,
          }),
        ).toThrow("scope, period or freshness is invalid");
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function manifest(
  overrides: {
    readonly feedRows?: readonly {
      readonly providerKey: string;
      readonly rowJson: string;
    }[];
    readonly eligibilityRows?: readonly { readonly rowJson: string }[];
    readonly timestampPolicy?: "published_at" | "observed_at";
  } = {},
) {
  return buildReaderSummaryDayDatasetManifest({
    ...scope,
    timestampPolicy: overrides.timestampPolicy,
    feedRows: overrides.feedRows ?? [row("reddit", "body")],
    eligibilityRows: overrides.eligibilityRows ?? [
      { rowJson: '{"binding":"enabled"}' },
    ],
  });
}

function row(providerKey: string, body: string) {
  return {
    providerKey,
    rowJson: JSON.stringify({ id: "item-1", body }),
  };
}

function queryClient(changed = false) {
  return { $queryRaw: queryRaw(changed) } as never;
}

function lockCapableQueryClient(changed = false) {
  return {
    $queryRaw: queryRaw(changed),
    $executeRaw: jest.fn(async () => 0),
  };
}

function queryRaw(changed: boolean | (() => boolean)) {
  let call = 0;
  return jest.fn(async () => {
    call += 1;
    return call % 2 === 1
      ? [
          row(
            "reddit",
            (typeof changed === "function" ? changed() : changed)
              ? "changed body"
              : "body",
          ),
        ]
      : [{ rowJson: '{"binding":"enabled"}' }];
  });
}
