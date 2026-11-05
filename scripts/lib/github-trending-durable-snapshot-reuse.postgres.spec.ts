import { deepStrictEqual } from "node:assert";
import { buildGitHubTrendingCapacityGenerations } from "./github-trending-capacity-native-scenario";
import { githubTrendingDurableSnapshotCandidatesFitBudget } from "./github-trending-durable-snapshot-candidate-budget";
import { randomUUID } from "node:crypto";

import { type Pool } from "pg";

import {
  githubTrendingDurableSnapshotProofPassesInvariants,
  githubTrendingDurableSnapshotRowLimit,
  InMemoryGitHubTrendingDurableSnapshotReader,
  PrismaGitHubTrendingDurableSnapshotReader,
  reuseGitHubTrendingDurableSnapshot,
  type GitHubTrendingDurableSnapshotCandidate,
  type GitHubTrendingDurableSnapshotProof,
  type GitHubTrendingDurableSnapshotReader,
} from "./github-trending-durable-snapshot-reuse";
import {
  buildGitHubTrendingPostgresCandidates,
  githubTrendingPostgresFixtureScope,
  resetGitHubTrendingPostgresFixture,
  seedGitHubTrendingPostgresCandidates,
} from "./github-trending-durable-snapshot-reuse-postgres-fixture";

export const githubTrendingPostgresScenarioNames = [
  "coherent Top10 and in-memory/Prisma parity",
  "malformed newest ordering identity with no fallback",
  "sourcePublishedAt-only day touch rejection with no fallback",
  "feedFetchStartedAt-only day touch rejection with no fallback",
  "feedCheckedAt-only day touch rejection with no fallback",
  "source-item tenant/workspace scope rejection",
  "mixed scan rejection",
  "observedAt mismatch rejection",
  "invalid UUID scope rejection by PostgreSQL casts",
  "row-limit overflow rejection and parity",
  "newest invalid and incomplete captures have no fallback",
  "SQL NULL and missing metadata remain invalid",
  "SQL Unicode caps and original octet lengths",
  "200 accumulated valid rows and 201 sentinel",
] as const;

export const runGitHubTrendingDurableSnapshotPostgresScenarios = async (
  pool: Pool,
): Promise<void> => {
  await coherentTop10AndParity(pool);
  await malformedNewestHasNoFallback(pool);
  await sourcePublishedAtOnlyDayTouchHasNoFallback(pool);
  await feedFetchStartedAtOnlyDayTouchHasNoFallback(pool);
  await feedCheckedAtOnlyDayTouchHasNoFallback(pool);
  await sourceItemScopeMismatchIsRejected(pool);
  await mixedScanIsRejected(pool);
  await observedAtMismatchIsRejected(pool);
  await invalidUuidScopeIsRejected(pool);
  await rowLimitOverflowIsRejected(pool);
  await accumulatedCapacityAndSentinel(pool);
  await unicodeCapsAndOctets(pool);
  await nullAndMissingMetadata(pool);
  await newestInvalidCaptures(pool);
};

const coherentTop10AndParity = async (pool: Pool): Promise<void> => {
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "coherent",
  });
  await prepare(pool, candidates);
  const statementLog = new ActualPostgresStatementLog(pool);

  const postgresProof = await reuse(statementLog.reader());
  const memoryProof = await reuse(
    new InMemoryGitHubTrendingDurableSnapshotReader(candidates),
  );

  assertOneStatementSnapshot(statementLog);
  assertDeepEqual(
    postgresProof,
    memoryProof,
    "real PostgreSQL row mapping must match in-memory proof semantics",
  );
  assertDeepEqual(
    postgresProof.rows.map((row) => row.rank),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    "real PostgreSQL proof must contain deterministic ranks 1..10",
  );
  assert(
    githubTrendingDurableSnapshotProofPassesInvariants(postgresProof),
    "real PostgreSQL Top10 proof must pass all invariants",
  );
};

const malformedNewestHasNoFallback = async (pool: Pool): Promise<void> => {
  const older = buildGitHubTrendingPostgresCandidates({
    groupKey: "older",
    fetchStartedAt: "2026-07-23T11:50:00.000Z",
    checkedAt: "2026-07-23T12:00:00.000Z",
    observedAt: "2026-07-23T12:00:01.000Z",
  });
  const malformedNewest = buildGitHubTrendingPostgresCandidates({
    groupKey: "malformed-newest",
    fetchStartedAt: "2026-07-23T23:50:00.000",
    checkedAt: "2026-07-23T23:59:00.000",
    publishedAt: "2026-07-22T00:01:00.000Z",
    observedAt: "2026-07-23T23:59:01.000Z",
  });
  const candidates = [...older, ...malformedNewest];
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "invalid_ordering_identity",
  });
};

const sourcePublishedAtOnlyDayTouchHasNoFallback = async (
  pool: Pool,
): Promise<void> =>
  dayTouchIdentityMismatchHasNoFallback(pool, {
    groupKey: "source-published-at-only",
    field: "sourcePublishedAt",
    dayTouch: "2026-07-23T23:58:00.000Z",
  });

const feedFetchStartedAtOnlyDayTouchHasNoFallback = async (
  pool: Pool,
): Promise<void> =>
  dayTouchIdentityMismatchHasNoFallback(pool, {
    groupKey: "feed-fetch-started-at-only",
    field: "feedFetchStartedAt",
    dayTouch: "2026-07-23T23:57:00.000Z",
  });

const feedCheckedAtOnlyDayTouchHasNoFallback = async (
  pool: Pool,
): Promise<void> =>
  dayTouchIdentityMismatchHasNoFallback(pool, {
    groupKey: "feed-checked-at-only",
    field: "feedCheckedAt",
    dayTouch: "2026-07-23T23:59:00.000Z",
  });

const dayTouchIdentityMismatchHasNoFallback = async (
  pool: Pool,
  params: {
    readonly groupKey: string;
    readonly field:
      | "sourcePublishedAt"
      | "feedFetchStartedAt"
      | "feedCheckedAt";
    readonly dayTouch: string;
  },
): Promise<void> => {
  const olderFallback = buildGitHubTrendingPostgresCandidates({
    groupKey: `${params.groupKey}-fallback`,
    fetchStartedAt: "2026-07-23T11:50:00.000Z",
    checkedAt: "2026-07-23T12:00:00.000Z",
    observedAt: "2026-07-23T12:00:01.000Z",
  });
  const invalidDayTouching = buildGitHubTrendingPostgresCandidates({
    groupKey: params.groupKey,
    fetchStartedAt: "2026-07-22T11:50:00.000Z",
    checkedAt: "2026-07-22T12:00:00.000Z",
    observedAt: "2026-07-22T12:00:01.000Z",
    mutate: (row) => ({ ...row, [params.field]: params.dayTouch }),
  });
  const candidates = [...olderFallback, ...invalidDayTouching];
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "invalid_ordering_identity",
  });
};

const sourceItemScopeMismatchIsRejected = async (
  pool: Pool,
): Promise<void> => {
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "source-scope-mismatch",
    mutate: (row) => ({
      ...row,
      sourceTenantId: "10000000-0000-4000-8000-000000000009",
      sourceWorkspaceId: "20000000-0000-4000-8000-000000000009",
    }),
  });
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "snapshot_missing",
  });
};

const mixedScanIsRejected = async (pool: Pool): Promise<void> => {
  const secondScanJobId = randomUUID();
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "mixed-scan",
    mutate: (row, index) =>
      index === 9
        ? {
            ...row,
            scanJobId: secondScanJobId,
            feedScanJobId: secondScanJobId,
            providerItemId: `github-trending-page:daily:${secondScanJobId}:${row.repositoryFullName}`,
          }
        : row,
  });
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "ambiguous_scan_identity",
  });
};

const observedAtMismatchIsRejected = async (pool: Pool): Promise<void> => {
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "observed-mismatch",
    mutate: (row, index) =>
      index === 9
        ? {
            ...row,
            feedObservedAt: "2026-07-24T00:00:02.000Z",
            sourceObservedAt: "2026-07-24T00:00:02.000Z",
          }
        : row,
  });
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "ambiguous_scan_identity",
  });
};

const invalidUuidScopeIsRejected = async (pool: Pool): Promise<void> => {
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "invalid-uuid",
  });
  await prepare(pool, candidates);
  const statementLog = new ActualPostgresStatementLog(pool);
  const error = await captureError(() =>
    reuse(statementLog.reader(), {
      tenantId: "not-a-uuid",
    }),
  );

  assertOneStatementSnapshot(statementLog);
  assert(
    postgresErrorCode(error) === "22P02",
    `invalid UUID scope must be rejected by a real PostgreSQL UUID cast, got ${message(
      error,
    )}`,
  );
};

const rowLimitOverflowIsRejected = async (pool: Pool): Promise<void> => {
  const candidates = buildGitHubTrendingPostgresCandidates({
    groupKey: "overflow",
    rowCount: githubTrendingDurableSnapshotRowLimit + 1,
  });
  await prepare(pool, candidates);
  await assertPostgresAndMemoryReject({
    pool,
    candidates,
    expectedMessage: "candidate_bound_exceeded",
  });
};


const readNativeCandidates = (pool: Pool) =>
  new PrismaGitHubTrendingDurableSnapshotReader(pool).readCandidates({
    ...githubTrendingPostgresFixtureScope,
    requestedUtcDay: "2026-07-23",
  });

const accumulatedCapacityAndSentinel = async (pool: Pool): Promise<void> => {
  const candidates = buildGitHubTrendingCapacityGenerations(20);
  await prepare(pool, candidates);
  const mapped = await readNativeCandidates(pool);
  assert(mapped.length === 200, "native reader must retain all 200 candidates");
  deepStrictEqual([...mapped].sort(byFeedId), [...candidates].sort(byFeedId),
    "all 44 native fields must match the accumulated fixture");
  const log = new ActualPostgresStatementLog(pool);
  const proof = await reuse(log.reader());
  assertOneStatementSnapshot(log);
  assertDeepEqual(proof, await reuse(new InMemoryGitHubTrendingDurableSnapshotReader(candidates)),
    "200-row native proof must match full memory proof");
  assertDeepEqual(proof, await reuse(new InMemoryGitHubTrendingDurableSnapshotReader(candidates.slice(-10))),
    "accumulation must preserve the exact latest-ten proof");
  assert(githubTrendingDurableSnapshotProofPassesInvariants(proof), "capacity proof invariants");
  const sentinel = buildGitHubTrendingPostgresCandidates({ groupKey: "sentinel", rowCount: 1 });
  await seedGitHubTrendingPostgresCandidates(pool, sentinel);
  assert((await readNativeCandidates(pool)).length === 201, "native overflow sentinel must be returned");
  await assertPostgresAndMemoryReject({ pool, candidates: [...candidates, ...sentinel],
    expectedMessage: "candidate_bound_exceeded" });
};

const byFeedId = (a: GitHubTrendingDurableSnapshotCandidate, b: GitHubTrendingDurableSnapshotCandidate) =>
  a.feedItemId.localeCompare(b.feedItemId, "en-US");

const unicodeCapsAndOctets = async (pool: Pool): Promise<void> => {
  // Include supplementary code points, escaped controls, quotes and backslashes.
  // U+0000 is not PostgreSQL text; U+0001 exercises JSON escaping natively.
  for (const character of ["😀", "\u0001", '"', "\\"]) {
    const title = character.repeat(514);
    const body = character.repeat(4098);
    const candidates = buildGitHubTrendingPostgresCandidates({ mutate: (row) => ({
      ...row, sourceTitle: title, feedTitle: title, bodyPreview: body,
      sourceTitleBytes: Buffer.byteLength(title), feedTitleBytes: Buffer.byteLength(title),
      bodyPreviewBytes: Buffer.byteLength(body), feedProviderKey: character.repeat(65),
      sourceProviderKey: character.repeat(65), feedStatus: character.repeat(33),
      scanJobStatus: character.repeat(33), feedSnapshotProviderKey: character.repeat(65),
    }) });
    await prepare(pool, candidates);
    const rows = await readNativeCandidates(pool);
    assert(rows.length === 10, "invalid provider/status rows must not be filtered out by SQL");
    for (const row of rows) {
      assertDeepEqual([row.sourceTitle, row.feedTitle, row.bodyPreview],
        [character.repeat(513), character.repeat(513), character.repeat(4097)],
        "SQL left must count Unicode code points");
      assertDeepEqual([row.sourceTitleBytes, row.feedTitleBytes, row.bodyPreviewBytes],
        [Buffer.byteLength(title), Buffer.byteLength(title), Buffer.byteLength(body)],
        "octet_length must retain original untruncated UTF8 sizes");
      assertDeepEqual([row.feedProviderKey, row.sourceProviderKey, row.feedSnapshotProviderKey,
        row.feedStatus, row.scanJobStatus], [character.repeat(64), character.repeat(64),
        character.repeat(64), character.repeat(32), character.repeat(32)], "new SQL caps must match");
    }
    assert(githubTrendingDurableSnapshotCandidatesFitBudget(rows), "native capped values must fit transport budget");
    await assertPostgresAndMemoryReject({ pool, candidates: rows, expectedMessage: "selected_group_invalid" });
  }
  // Isolate visible-text checks from provider/status rejection, with no truncation.
  for (const text of ["é😀\t\n", "visible\u0001control", "😀".repeat(129)]) {
    const candidates = buildGitHubTrendingPostgresCandidates({ mutate: (row) => ({
      ...row, sourceTitle: text, feedTitle: text, bodyPreview: text,
      sourceTitleBytes: Buffer.byteLength(text), feedTitleBytes: Buffer.byteLength(text),
      bodyPreviewBytes: Buffer.byteLength(text),
    }) });
    await prepare(pool, candidates);
    if (text === "é😀\t\n") {
      assertDeepEqual(await reuse(new PrismaGitHubTrendingDurableSnapshotReader(pool)),
        await reuse(new InMemoryGitHubTrendingDurableSnapshotReader(candidates)), "valid multibyte proof parity");
    } else {
      await assertPostgresAndMemoryReject({ pool, candidates, expectedMessage: "selected_group_invalid" });
    }
  }
};

const nullAndMissingMetadata = async (pool: Pool): Promise<void> => {
  const cases = [
    { sql: "update feed_items set provider_metadata = NULL", field: "feedCheckedAt", value: null,
      error: "invalid_ordering_identity" },
    { sql: "update source_items set metadata = metadata - 'kind'", field: "metadataKind", value: null,
      error: "selected_group_invalid" },
    { sql: `update source_items set metadata = jsonb_set(metadata, '{kind}', 'null'::jsonb)`,
      field: "metadataKind", value: null, error: "selected_group_invalid" },
    { sql: "update source_items set provider_content_hash = NULL", field: "sourceProviderContentHash", value: "",
      error: "selected_group_invalid" },
    { sql: "update source_items set metadata = metadata #- '{trending,rank}'", field: "rank", value: 0,
      error: "selected_group_invalid" },
  ] as const;
  for (const scenario of cases) {
    const candidates = buildGitHubTrendingCapacityGenerations(20);
    await prepare(pool, candidates);
    const metadataColumn = scenario.sql.startsWith("update feed_items") ? "provider_metadata" : "metadata";
    await pool.query(`${scenario.sql} where ${metadataColumn}->'trending'->>'scanJobId' = $1`,
      [candidates.at(-1)!.scanJobId]);
    const rows = await readNativeCandidates(pool);
    const newestIds = new Set(candidates.slice(-10).map((row) => row.feedItemId));
    const newest = rows.filter((row) => newestIds.has(row.feedItemId));
    assert(rows.length === 200 && newest.length === 10, "NULL newest evidence must remain alongside older fallback");
    assert(newest.every((row) => row[scenario.field] === scenario.value), "native NULL/missing mapping parity");
    assert(githubTrendingDurableSnapshotCandidatesFitBudget(rows), "NULL evidence fits transport budget");
    await assertPostgresAndMemoryReject({ pool, candidates: rows, expectedMessage: scenario.error });
  }
};

const newestInvalidCaptures = async (pool: Pool): Promise<void> => {
  const cases = [
    ["update source_items set metadata = jsonb_set(metadata, '{trending,fetchStartedAt}', '\"malformed\"'::jsonb) where metadata->'trending'->>'scanJobId' <> $1", "invalid_ordering_identity"],
    ["update scan_jobs set status = 'FAILED' where id = $1::uuid", "selected_group_invalid"],
    ["delete from scan_jobs where id = $1::uuid", "selected_group_invalid"],
    ["update feed_items set status = 'HIDDEN' where provider_metadata->'trending'->>'scanJobId' = $1", "selected_group_invalid"],
    ["delete from feed_items where id = (select id from feed_items where provider_metadata->'trending'->>'scanJobId' = $1 limit 1)", "partial_group"],
    ["update feed_items set title = 'mismatch' where provider_metadata->'trending'->>'scanJobId' = $1", "selected_group_invalid"],
  ] as const;
  for (const [sql, expectedMessage] of cases) {
    const candidates = buildGitHubTrendingCapacityGenerations(20);
    await prepare(pool, candidates);
    await pool.query(sql, [candidates.at(-1)!.scanJobId]);
    const mapped = await readNativeCandidates(pool);
    assert(mapped.length >= 199, "newest invalid evidence and older fallback must remain visible");
    await assertPostgresAndMemoryReject({ pool, candidates: mapped, expectedMessage });
  }
};

const prepare = async (
  pool: Pool,
  candidates: readonly GitHubTrendingDurableSnapshotCandidate[],
): Promise<void> => {
  await resetGitHubTrendingPostgresFixture(pool);
  await seedGitHubTrendingPostgresCandidates(pool, candidates);
};

const assertPostgresAndMemoryReject = async (params: {
  readonly pool: Pool;
  readonly candidates: readonly GitHubTrendingDurableSnapshotCandidate[];
  readonly expectedMessage: string;
}): Promise<void> => {
  const statementLog = new ActualPostgresStatementLog(params.pool);
  const postgresError = await captureError(() => reuse(statementLog.reader()));
  const memoryError = await captureError(() =>
    reuse(new InMemoryGitHubTrendingDurableSnapshotReader(params.candidates)),
  );

  assertOneStatementSnapshot(statementLog);
  for (const [reader, error] of [
    ["PostgreSQL", postgresError],
    ["in-memory", memoryError],
  ] as const) {
    assert(
      message(error).includes(params.expectedMessage),
      `${reader} reader must reject with ${params.expectedMessage}, got ${message(
        error,
      )}`,
    );
  }
};

const reuse = (
  reader: GitHubTrendingDurableSnapshotReader,
  overrides?: {
    readonly tenantId?: string;
    readonly workspaceId?: string;
    readonly sourceBindingId?: string;
  },
): Promise<GitHubTrendingDurableSnapshotProof> =>
  reuseGitHubTrendingDurableSnapshot({
    reader,
    tenantId: overrides?.tenantId ?? githubTrendingPostgresFixtureScope.tenantId,
    workspaceId:
      overrides?.workspaceId ?? githubTrendingPostgresFixtureScope.workspaceId,
    sourceBindingId:
      overrides?.sourceBindingId ??
      githubTrendingPostgresFixtureScope.sourceBindingId,
    requestedUtcDay: "2026-07-23",
    observedThrough: new Date("2026-07-24T00:05:00.000Z"),
  });

class ActualPostgresStatementLog {
  readonly statements: string[] = [];

  constructor(private readonly pool: Pool) {}

  reader(): PrismaGitHubTrendingDurableSnapshotReader {
    const database = {
      query: (text: string, values?: readonly unknown[]) => {
        this.statements.push(text);
        return this.pool.query(text, values as unknown[]);
      },
    } as unknown as Pick<Pool, "query">;
    return new PrismaGitHubTrendingDurableSnapshotReader(database);
  }
}

const assertOneStatementSnapshot = (
  statementLog: ActualPostgresStatementLog,
): void => {
  assert(
    statementLog.statements.length === 1,
    `durable reuse must read one PostgreSQL statement snapshot, got ${statementLog.statements.length}`,
  );
  const statements = statementLog.statements[0]!
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  assert(
    statements.length === 1 && /^select\b/iu.test(statements[0]!),
    "durable reuse snapshot must be one SELECT statement",
  );
};

const captureError = async (
  operation: () => Promise<unknown>,
): Promise<unknown> => {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected operation to reject");
};

const postgresErrorCode = (error: unknown): string | undefined =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof error.code === "string"
    ? error.code
    : undefined;

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const assertDeepEqual = (
  actual: unknown,
  expected: unknown,
  assertionMessage: string,
): void => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${assertionMessage}: expected ${JSON.stringify(
        expected,
      )}, got ${JSON.stringify(actual)}`,
    );
  }
};

const assert: (condition: boolean, message: string) => asserts condition = (
  condition,
  assertionMessage,
) => {
  if (!condition) {
    throw new Error(assertionMessage);
  }
};

if (typeof describe === "function") {
  describe("GitHub Trending disposable PostgreSQL gate declaration", () => {
    it("keeps every required real-PostgreSQL scenario in the standalone gate", () => {
      expect(githubTrendingPostgresScenarioNames).toEqual([
        "coherent Top10 and in-memory/Prisma parity",
        "malformed newest ordering identity with no fallback",
        "sourcePublishedAt-only day touch rejection with no fallback",
        "feedFetchStartedAt-only day touch rejection with no fallback",
        "feedCheckedAt-only day touch rejection with no fallback",
        "source-item tenant/workspace scope rejection",
        "mixed scan rejection",
        "observedAt mismatch rejection",
        "invalid UUID scope rejection by PostgreSQL casts",
        "row-limit overflow rejection and parity",
        "newest invalid and incomplete captures have no fallback",
        "SQL NULL and missing metadata remain invalid",
        "SQL Unicode caps and original octet lengths",
        "200 accumulated valid rows and 201 sentinel",
      ]);
    });
  });
}
