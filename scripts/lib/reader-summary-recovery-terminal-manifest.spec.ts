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
  extractReaderSummaryRecoveryTerminalManifest,
  recoveryTerminalManifestEvidenceSql,
  type RecoveryTerminalManifestQueryClient,
} from "../build-reader-summary-recovery-terminal-manifest";
import {
  buildReaderSummaryRecoveryTerminalManifest,
  deriveRecoveryTerminalDatabaseIdentity,
  recoveryTerminalManifestProviderKeys,
  serializeReaderSummaryRecoveryTerminalManifest,
  validateReaderSummaryRecoveryTerminalManifest,
  type ReaderSummaryRecoveryTerminalManifest,
  type RecoveryTerminalManifestDatabaseRow,
  type RecoveryTerminalManifestEvidenceRow,
} from "./reader-summary-recovery-terminal-manifest";

const requestedUtcDate = "2026-07-24";
const tenantId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "10000000-0000-4000-8000-000000000002";
const databaseRow: RecoveryTerminalManifestDatabaseRow = {
  databaseName: "restored_recovery_scratch",
  databaseOid: "16384",
  systemIdentifier: "7493984729384729384",
  serverVersionNumber: "180001",
  transactionReadOnly: "on",
};
const databaseIdentity =
  deriveRecoveryTerminalDatabaseIdentity(databaseRow);

describe("reader summary recovery terminal manifest", () => {
  let directory: string | undefined;

  afterEach(() => {
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
      directory = undefined;
    }
  });

  it("selects exact scoped VISIBLE published-at rows and seals canonical leaves", () => {
    expect(recoveryTerminalManifestEvidenceSql).toContain(
      'feed."tenant_id" = $1::UUID',
    );
    expect(recoveryTerminalManifestEvidenceSql).toContain(
      'feed."workspace_id" = $2::UUID',
    );
    expect(recoveryTerminalManifestEvidenceSql).toContain(
      'feed."status" = \'VISIBLE\'',
    );
    expect(recoveryTerminalManifestEvidenceSql).toContain(
      'feed."published_at" >= $3::TIMESTAMPTZ',
    );
    expect(recoveryTerminalManifestEvidenceSql).toContain(
      'feed."published_at" < $4::TIMESTAMPTZ',
    );
    expect(recoveryTerminalManifestEvidenceSql).not.toMatch(
      /feed\."observed_at"\s*[<>]=?/u,
    );

    const rows = recoveryTerminalManifestProviderKeys.map(
      (providerKey, index) =>
        evidenceRow(providerKey, index + 1, {
          observedAt:
            providerKey === "hacker-news"
              ? new Date("2026-07-25T00:00:00.000Z")
              : new Date("2026-07-24T12:01:00.000Z"),
        }),
    );
    rows.push(evidenceRow("reddit", 9));
    const first = manifest(rows);
    const replayPlan = manifest([...rows].reverse());

    expect(replayPlan).toEqual(first);
    expect(first.providers.map((provider) => provider.providerKey)).toEqual(
      recoveryTerminalManifestProviderKeys,
    );
    expect(first.providers.map((provider) => provider.count)).toEqual([
      1, 1, 2, 1, 1,
    ]);
    expect(first.providers[2]?.leaves.map((leaf) => leaf.feedItemId)).toEqual(
      [...(first.providers[2]?.leaves ?? [])]
        .map((leaf) => leaf.feedItemId)
        .sort(codeUnitCompare),
    );
    expect(first.providers[0]?.leaves[0]?.sourceContentHash).toBe(
      "1".padStart(64, "0"),
    );
    expect(first.providers[1]?.leaves[0]?.sourceProviderContentHash).toBeNull();
    expect(first.providers[1]?.leaves[0]?.observedAt).toBe(
      "2026-07-25T00:00:00.000Z",
    );
    expect(first.providers[0]?.leaves[0]?.github).toEqual({
      resultId: "50000000-0000-4000-8000-000000000001",
      scanJobId: "60000000-0000-4000-8000-000000000001",
      scanAttemptNumber: 2,
      repositoryIdentity: "fixture/repo1",
      rank: 1,
      checkedAt: "2026-07-24T11:59:00.000Z",
    });
    expect(serializeReaderSummaryRecoveryTerminalManifest(first)).toEqual(
      serializeReaderSummaryRecoveryTerminalManifest(replayPlan),
    );
  });

  it("rejects symbols, non-enumerables and non-dense array properties", () => {
    const original = manifest([evidenceRow("github-trending-page", 1)]);
    const symbolRoot = jsonClone(original);
    Object.defineProperty(symbolRoot, Symbol("forged"), {
      enumerable: true,
      value: "forged",
    });
    const hiddenRoot = jsonClone(original);
    Object.defineProperty(hiddenRoot, "hidden", {
      enumerable: false,
      value: "forged",
    });
    const symbolLeaf = jsonClone(original);
    const leaf = firstLeaf(symbolLeaf);
    Object.defineProperty(leaf, Symbol("forged"), {
      enumerable: true,
      value: "forged",
    });
    const arrayProperty = jsonClone(original);
    Object.defineProperty(
      (arrayProperty as { providers: unknown[] }).providers,
      "forged",
      { enumerable: true, value: true },
    );

    for (const forged of [
      symbolRoot,
      hiddenRoot,
      symbolLeaf,
      arrayProperty,
    ]) {
      expect(() =>
        validateReaderSummaryRecoveryTerminalManifest(forged),
      ).toThrow();
    }
  });

  it("verifies dump and scratch identity before exact replay", async () => {
    const fixture = filesystemFixture();
    const rows = [evidenceRow("reddit", 1)];
    const client = fakeClient(databaseRow, rows);
    const params = extractionParams(fixture, client);
    const created = await extractReaderSummaryRecoveryTerminalManifest(params);
    const replayed = await extractReaderSummaryRecoveryTerminalManifest(
      params,
    );

    expect(created.outcome).toBe("created");
    expect(replayed.outcome).toBe("replayed");
    expect(replayed.bytes).toEqual(created.bytes);

    const wrongIdentityClient = fakeClient(
      { ...databaseRow, databaseOid: "16385" },
      rows,
    );
    await expect(
      extractReaderSummaryRecoveryTerminalManifest({
        ...params,
        client: wrongIdentityClient,
      }),
    ).rejects.toThrow("scratch database identity diverged");
    expect(wrongIdentityClient.calls).toHaveLength(1);

    const absentClient = fakeClient(databaseRow, rows);
    await expect(
      extractReaderSummaryRecoveryTerminalManifest({
        ...params,
        client: absentClient,
        expectedDumpSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("source dump identity diverged");
    expect(absentClient.calls).toHaveLength(0);
  });

  it("rejects divergent replay and dump mutation during extraction", async () => {
    const fixture = filesystemFixture(0o600);
    const firstClient = fakeClient(databaseRow, [evidenceRow("reddit", 1)]);
    const params = extractionParams(fixture, firstClient);
    await extractReaderSummaryRecoveryTerminalManifest(params);

    await expect(
      extractReaderSummaryRecoveryTerminalManifest({
        ...params,
        client: fakeClient(databaseRow, [evidenceRow("reddit", 2)]),
      }),
    ).rejects.toThrow(/divergent replay|concurrent clobber/u);

    const mutationOutput = join(directory!, "mutation.json");
    const mutationClient = fakeClient(
      databaseRow,
      [evidenceRow("reddit", 1)],
      () => {
        writeFileSync(fixture.dumpPath, "mutated dump bytes\n");
      },
    );
    await expect(
      extractReaderSummaryRecoveryTerminalManifest({
        ...params,
        client: mutationClient,
        outputPath: mutationOutput,
      }),
    ).rejects.toThrow("source dump changed");
  });

  function filesystemFixture(mode = 0o400) {
    directory = mkdtempSync(join(tmpdir(), "terminal-manifest-core-"));
    const dumpPath = join(directory, "source.dump");
    writeFileSync(dumpPath, "restored scratch dump bytes\n", { mode });
    chmodSync(dumpPath, mode);
    return {
      dumpPath,
      outputPath: join(directory, "manifest.json"),
      dumpSha256: createHash("sha256")
        .update(readFileSync(dumpPath))
        .digest("hex"),
    };
  }
});

function manifest(
  rows: readonly unknown[],
): ReaderSummaryRecoveryTerminalManifest {
  return buildReaderSummaryRecoveryTerminalManifest({
    requestedUtcDate,
    tenantId,
    workspaceId,
    databaseIdentity,
    sourceDumpSha256: "d".repeat(64),
    rows,
  });
}

function evidenceRow(
  providerKey: string,
  ordinal: number,
  override: Partial<RecoveryTerminalManifestEvidenceRow> = {},
): RecoveryTerminalManifestEvidenceRow {
  const suffix = ordinal.toString().padStart(12, "0");
  const github = providerKey === "github-trending-page";
  return {
    providerKey,
    feedItemId: `10000000-0000-4000-8000-${suffix}`,
    sourceItemId: `20000000-0000-4000-8000-${suffix}`,
    sourceBindingId: `30000000-0000-4000-8000-${suffix}`,
    interestId: `40000000-0000-4000-8000-${suffix}`,
    providerItemId: `${providerKey}:${ordinal}`,
    canonicalUrl: github
      ? `https://github.com/fixture/repo${ordinal}`
      : `https://example.invalid/${providerKey}/${ordinal}`,
    title: `Synthetic title ${ordinal}`,
    bodyPreview: `Synthetic preview ${ordinal}`,
    sourceText: `Synthetic source ${ordinal}`,
    authorHandle: providerKey === "x-twitter" ? "fixture-author" : null,
    sourceContentHash: ordinal.toString(16).padStart(64, "0"),
    sourceProviderContentHash: github
      ? (ordinal + 1).toString(16).padStart(64, "0")
      : null,
    publishedAt: new Date(`${requestedUtcDate}T12:00:00.000Z`),
    observedAt: new Date(`${requestedUtcDate}T12:01:00.000Z`),
    githubResultId: github
      ? `50000000-0000-4000-8000-${suffix}`
      : null,
    githubScanJobId: github
      ? `60000000-0000-4000-8000-${suffix}`
      : null,
    githubAttemptNumber: github ? 2 : null,
    githubRepositoryIdentity: github ? `fixture/repo${ordinal}` : null,
    githubRank: github ? ordinal : null,
    githubCheckedAt: github
      ? new Date(`${requestedUtcDate}T11:59:00.000Z`)
      : null,
    ...override,
  };
}

function fakeClient(
  identity: RecoveryTerminalManifestDatabaseRow,
  rows: readonly RecoveryTerminalManifestEvidenceRow[],
  afterEvidence?: () => void,
): RecoveryTerminalManifestQueryClient & { readonly calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    query: async <TRow extends Readonly<Record<string, unknown>>>(
      sql: string,
    ) => {
      calls.push(sql);
      const selected = sql.includes("pg_control_system") ? [identity] : rows;
      if (!sql.includes("pg_control_system")) {
        afterEvidence?.();
      }
      return { rows: selected as readonly TRow[] };
    },
  };
}

function extractionParams(
  fixture: {
    readonly dumpPath: string;
    readonly dumpSha256: string;
    readonly outputPath: string;
  },
  client: RecoveryTerminalManifestQueryClient,
) {
  return {
    client,
    requestedUtcDate,
    tenantId,
    workspaceId,
    dumpPath: fixture.dumpPath,
    expectedDumpSha256: fixture.dumpSha256,
    expectedDatabaseIdentity: databaseIdentity,
    outputPath: fixture.outputPath,
  };
}

function jsonClone(input: unknown): Record<PropertyKey, unknown> {
  return JSON.parse(JSON.stringify(input)) as Record<PropertyKey, unknown>;
}

function firstLeaf(input: Record<PropertyKey, unknown>): object {
  const providers = input.providers as Array<{ leaves: object[] }>;
  return providers[0]!.leaves[0]!;
}

const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
