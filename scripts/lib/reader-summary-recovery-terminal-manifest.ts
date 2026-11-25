import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  assertReaderSummaryWeeklyPlainObject,
  canonicalizeReaderSummaryProductionRecoveryJson,
  deepFreezeReaderSummaryWeekly,
  readerSummaryWeeklyOwnDataKeys,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  publishRecoveryTerminalImmutableManifest,
  type RecoveryTerminalFilesystemCheckpointHandler,
} from "./reader-summary-recovery-terminal-manifest-filesystem";

export const recoveryTerminalManifestSchemaVersion =
  "reader_summary.recovery_terminal_manifest.v2";
export const recoveryTerminalManifestProviderKeys = [
  "github-trending-page",
  "hacker-news",
  "reddit",
  "rss",
  "x-twitter",
] as const;
export type RecoveryTerminalManifestProviderKey =
  (typeof recoveryTerminalManifestProviderKeys)[number];
export type RecoveryTerminalManifestGitHubTuple = Readonly<{
  resultId: string;
  scanJobId: string;
  scanAttemptNumber: number;
  repositoryIdentity: string;
  rank: number;
  checkedAt: string;
}>;
export type RecoveryTerminalManifestLeaf = Readonly<{
  providerKey: RecoveryTerminalManifestProviderKey;
  feedItemId: string;
  sourceItemId: string;
  sourceBindingId: string;
  interestId: string;
  providerItemId: string;
  canonicalUrl: string;
  title: string;
  bodyPreview: string;
  sourceText: string;
  authorHandle?: string;
  sourceContentHash: string;
  sourceProviderContentHash: string | null;
  publishedAt: string;
  observedAt: string;
  github?: RecoveryTerminalManifestGitHubTuple;
}>;
export type RecoveryTerminalManifestProvider = Readonly<{
  providerKey: RecoveryTerminalManifestProviderKey;
  count: number;
  leavesSha256: string;
  leaves: readonly RecoveryTerminalManifestLeaf[];
}>;
export type ReaderSummaryRecoveryTerminalManifest = Readonly<{
  schemaVersion: typeof recoveryTerminalManifestSchemaVersion;
  requestedUtcDate: string;
  period: Readonly<{
    startedAt: string;
    endedAt: string;
    timezone: "UTC";
  }>;
  tenantId: string;
  workspaceId: string;
  databaseIdentity: string;
  sourceDumpSha256: string;
  excludedFeedItemIds: readonly string[];
  providers: readonly RecoveryTerminalManifestProvider[];
  leafCount: number;
  rootSha256: string;
}>;
export type RecoveryTerminalManifestDatabaseRow = Readonly<{
  databaseName: unknown;
  databaseOid: unknown;
  systemIdentifier: unknown;
  serverVersionNumber: unknown;
  transactionReadOnly: unknown;
}>;
export type RecoveryTerminalManifestEvidenceRow = Readonly<{
  providerKey: unknown;
  feedItemId: unknown;
  sourceItemId: unknown;
  sourceBindingId: unknown;
  interestId: unknown;
  providerItemId: unknown;
  canonicalUrl: unknown;
  title: unknown;
  bodyPreview: unknown;
  sourceText: unknown;
  authorHandle: unknown;
  sourceContentHash: unknown;
  sourceProviderContentHash: unknown;
  publishedAt: unknown;
  observedAt: unknown;
  githubResultId: unknown;
  githubScanJobId: unknown;
  githubAttemptNumber: unknown;
  githubRepositoryIdentity: unknown;
  githubRank: unknown;
  githubCheckedAt: unknown;
}>;
export type RecoveryTerminalManifestPublishResult = Readonly<{
  outcome: "created" | "replayed";
  bytes: Buffer;
  manifest: ReaderSummaryRecoveryTerminalManifest;
}>;

const manifestKeys = [
  "schemaVersion",
  "requestedUtcDate",
  "period",
  "tenantId",
  "workspaceId",
  "databaseIdentity",
  "sourceDumpSha256",
  "excludedFeedItemIds",
  "providers",
  "leafCount",
  "rootSha256",
] as const;
const periodKeys = ["startedAt", "endedAt", "timezone"] as const;
const providerSectionKeys = [
  "providerKey",
  "count",
  "leavesSha256",
  "leaves",
] as const;
const leafKeys = [
  "providerKey",
  "feedItemId",
  "sourceItemId",
  "sourceBindingId",
  "interestId",
  "providerItemId",
  "canonicalUrl",
  "title",
  "bodyPreview",
  "sourceText",
  "sourceContentHash",
  "sourceProviderContentHash",
  "publishedAt",
  "observedAt",
] as const;
const githubTupleKeys = [
  "resultId",
  "scanJobId",
  "scanAttemptNumber",
  "repositoryIdentity",
  "rank",
  "checkedAt",
] as const;
const databaseRowKeys = [
  "databaseName",
  "databaseOid",
  "systemIdentifier",
  "serverVersionNumber",
  "transactionReadOnly",
] as const;
const evidenceRowKeys = [
  "providerKey",
  "feedItemId",
  "sourceItemId",
  "sourceBindingId",
  "interestId",
  "providerItemId",
  "canonicalUrl",
  "title",
  "bodyPreview",
  "sourceText",
  "authorHandle",
  "sourceContentHash",
  "sourceProviderContentHash",
  "publishedAt",
  "observedAt",
  "githubResultId",
  "githubScanJobId",
  "githubAttemptNumber",
  "githubRepositoryIdentity",
  "githubRank",
  "githubCheckedAt",
] as const;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const sha256Pattern = /^[0-9a-f]{64}$/u;
const databaseIdentityPattern =
  /^postgres-scratch-sha256:[0-9a-f]{64}$/u;
export const codeUnitCompare = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
export const deriveRecoveryTerminalDatabaseIdentity = (
  input: unknown,
): string => {
  assertExactObject(input, databaseRowKeys, "database identity");
  const databaseName = exactIdentity(input.databaseName, "database name");
  const databaseOid = exactDigits(input.databaseOid, "database OID");
  const systemIdentifier = exactDigits(
    input.systemIdentifier,
    "database system identifier",
  );
  const serverVersionNumber = exactDigits(
    input.serverVersionNumber,
    "database server version",
  );
  if (input.transactionReadOnly !== "on") {
    fail("scratch database transaction is not read only");
  }
  const canonicalIdentity = canonical({
    databaseName,
    databaseOid,
    systemIdentifier,
    serverVersionNumber,
  });
  return `postgres-scratch-sha256:${canonicalIdentity.sha256}`;
};
export const buildReaderSummaryRecoveryTerminalManifest = (params: {
  readonly requestedUtcDate: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly databaseIdentity: string;
  readonly sourceDumpSha256: string;
  readonly excludedFeedItemIds?: readonly string[];
  readonly rows: readonly unknown[];
}): ReaderSummaryRecoveryTerminalManifest => {
  const period = exactUtcDay(params.requestedUtcDate);
  const tenantId = exactUuid(params.tenantId, "tenant id");
  const workspaceId = exactUuid(params.workspaceId, "workspace id");
  const databaseIdentity = exactDatabaseIdentity(params.databaseIdentity);
  const sourceDumpSha256 = exactSha256(
    params.sourceDumpSha256,
    "source dump hash",
  );
  const excludedFeedItemIds = exactSortedUniqueUuids(
    params.excludedFeedItemIds ?? [],
    "excluded feed item ids",
  );
  assertReaderSummaryWeeklyDenseArray(
    params.rows,
    "terminal manifest evidence rows",
  );
  const excluded = new Set(excludedFeedItemIds);
  const seenFeedItemIds = new Set<string>();
  const selectedExcludedFeedItemIds = new Set<string>();
  const leaves = params.rows.map((row) => {
    const leaf = leafFromDatabaseRow(row, params.requestedUtcDate);
    if (seenFeedItemIds.has(leaf.feedItemId)) {
      fail("database evidence contains duplicate feed item ids");
    }
    seenFeedItemIds.add(leaf.feedItemId);
    if (excluded.has(leaf.feedItemId)) {
      selectedExcludedFeedItemIds.add(leaf.feedItemId);
    }
    return leaf;
  });
  if (
    excludedFeedItemIds.some(
      (feedItemId) => !selectedExcludedFeedItemIds.has(feedItemId),
    )
  ) {
    fail("an excluded feed item is outside the selected database day");
  }
  const includedLeaves = leaves.filter(
    (leaf) => !excluded.has(leaf.feedItemId),
  );
  const providers = recoveryTerminalManifestProviderKeys.map((providerKey) => {
    const providerLeaves = includedLeaves
      .filter((leaf) => leaf.providerKey === providerKey)
      .sort((left, right) =>
        codeUnitCompare(left.feedItemId, right.feedItemId),
      );
    return Object.freeze({
      providerKey,
      count: providerLeaves.length,
      leavesSha256: canonical(providerLeaves).sha256,
      leaves: Object.freeze(providerLeaves),
    });
  });
  const withoutRoot = {
    schemaVersion: recoveryTerminalManifestSchemaVersion,
    requestedUtcDate: params.requestedUtcDate,
    period,
    tenantId,
    workspaceId,
    databaseIdentity,
    sourceDumpSha256,
    excludedFeedItemIds,
    providers,
    leafCount: includedLeaves.length,
  } as const;
  return validateReaderSummaryRecoveryTerminalManifest({
    ...withoutRoot,
    rootSha256: canonical(withoutRoot).sha256,
  });
};
export function validateReaderSummaryRecoveryTerminalManifest(
  input: unknown,
): ReaderSummaryRecoveryTerminalManifest {
  assertExactObject(input, manifestKeys, "manifest");
  if (
    input.schemaVersion !== recoveryTerminalManifestSchemaVersion ||
    typeof input.requestedUtcDate !== "string"
  ) {
    fail("manifest version or date is malformed");
  }
  const requestedUtcDate = input.requestedUtcDate;
  const period = exactUtcDay(requestedUtcDate);
  assertExactObject(input.period, periodKeys, "period");
  if (
    input.period.startedAt !== period.startedAt ||
    input.period.endedAt !== period.endedAt ||
    input.period.timezone !== "UTC"
  ) {
    fail("manifest period is malformed");
  }
  const tenantId = exactUuid(input.tenantId, "tenant id");
  const workspaceId = exactUuid(input.workspaceId, "workspace id");
  const databaseIdentity = exactDatabaseIdentity(input.databaseIdentity);
  const sourceDumpSha256 = exactSha256(
    input.sourceDumpSha256,
    "source dump hash",
  );
  const excludedFeedItemIds = exactSortedUniqueUuids(
    input.excludedFeedItemIds,
    "excluded feed item ids",
  );
  assertReaderSummaryWeeklyDenseArray(
    input.providers,
    "terminal manifest providers",
  );
  if (input.providers.length !== recoveryTerminalManifestProviderKeys.length) {
    fail("provider collection is malformed");
  }

  const seenFeedItemIds = new Set<string>();
  let leafCount = 0;
  const providers = input.providers.map((provider, providerIndex) => {
    const expectedProvider =
      recoveryTerminalManifestProviderKeys[providerIndex];
    if (expectedProvider === undefined) {
      fail("provider collection is malformed");
    }
    assertExactObject(provider, providerSectionKeys, "provider");
    const providerLeaves = provider.leaves;
    assertReaderSummaryWeeklyDenseArray(
      providerLeaves,
      "terminal manifest provider leaves",
    );
    if (
      provider.providerKey !== expectedProvider ||
      !Number.isSafeInteger(provider.count) ||
      Number(provider.count) < 0 ||
      provider.count !== providerLeaves.length
    ) {
      fail("provider section is malformed");
    }
    const leaves = providerLeaves.map((leaf, index) => {
      const validated = validateLeaf(
        leaf,
        expectedProvider,
        requestedUtcDate,
      );
      const previous = index === 0
        ? undefined
        : validateLeaf(
            providerLeaves[index - 1],
            expectedProvider,
            requestedUtcDate,
          );
      if (previous !== undefined) {
        if (codeUnitCompare(previous.feedItemId, validated.feedItemId) >= 0) {
          fail("feed item ids are not strictly code-unit sorted");
        }
      }
      if (
        seenFeedItemIds.has(validated.feedItemId) ||
        excludedFeedItemIds.includes(validated.feedItemId)
      ) {
        fail("feed item identity is duplicated or excluded");
      }
      seenFeedItemIds.add(validated.feedItemId);
      return validated;
    });
    const leavesSha256 = exactSha256(
      provider.leavesSha256,
      "provider leaf hash",
    );
    if (leavesSha256 !== canonical(leaves).sha256) {
      fail("provider leaf hash diverged");
    }
    leafCount += leaves.length;
    return Object.freeze({
      providerKey: expectedProvider,
      count: leaves.length,
      leavesSha256,
      leaves: Object.freeze(leaves),
    });
  });
  if (
    !Number.isSafeInteger(input.leafCount) ||
    input.leafCount !== leafCount
  ) {
    fail("manifest leaf count is malformed");
  }
  const rootSha256 = exactSha256(input.rootSha256, "manifest root hash");
  const withoutRoot = {
    schemaVersion: recoveryTerminalManifestSchemaVersion,
    requestedUtcDate,
    period,
    tenantId,
    workspaceId,
    databaseIdentity,
    sourceDumpSha256,
    excludedFeedItemIds,
    providers,
    leafCount,
  } as const;
  if (rootSha256 !== canonical(withoutRoot).sha256) {
    fail("manifest root hash diverged");
  }
  return deepFreezeReaderSummaryWeekly({
    ...withoutRoot,
    rootSha256,
  });
}

export const serializeReaderSummaryRecoveryTerminalManifest = (
  input: unknown,
): Buffer => {
  const manifest = validateReaderSummaryRecoveryTerminalManifest(input);
  return Buffer.from(`${canonical(manifest).json}\n`, "utf8");
};
export const publishReaderSummaryRecoveryTerminalManifest = (params: {
  readonly outputPath: string;
  readonly manifest: ReaderSummaryRecoveryTerminalManifest;
  readonly filesystemCheckpoint?: RecoveryTerminalFilesystemCheckpointHandler;
}): RecoveryTerminalManifestPublishResult => {
  const manifest = validateReaderSummaryRecoveryTerminalManifest(
    params.manifest,
  );
  const bytes = serializeReaderSummaryRecoveryTerminalManifest(manifest);
  return publishRecoveryTerminalImmutableManifest({
    outputPath: params.outputPath,
    bytes,
    manifest,
    parseAndValidate: parseCanonicalManifestBytes,
    checkpoint: params.filesystemCheckpoint,
  });
};
const parseCanonicalManifestBytes = (
  bytes: Buffer,
): ReaderSummaryRecoveryTerminalManifest => {
  let input: unknown;
  try {
    input = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    fail("existing output is not valid JSON");
  }
  const manifest = validateReaderSummaryRecoveryTerminalManifest(input);
  if (!bytes.equals(serializeReaderSummaryRecoveryTerminalManifest(manifest))) {
    fail("existing output is not exact canonical bytes");
  }
  return manifest;
};
const leafFromDatabaseRow = (
  input: unknown,
  requestedUtcDate: string,
): RecoveryTerminalManifestLeaf => {
  assertExactObject(input, evidenceRowKeys, "database evidence row");
  const providerKey = exactProvider(input.providerKey);
  const publishedAt = exactTimestamp(input.publishedAt, "published timestamp");
  if (publishedAt.slice(0, 10) !== requestedUtcDate) {
    fail("published timestamp is outside the selected day");
  }
  const leaf: RecoveryTerminalManifestLeaf = {
    providerKey,
    feedItemId: exactUuid(input.feedItemId, "feed item id"),
    sourceItemId: exactUuid(input.sourceItemId, "source item id"),
    sourceBindingId: exactUuid(input.sourceBindingId, "source binding id"),
    interestId: exactUuid(input.interestId, "interest id"),
    providerItemId: exactIdentity(input.providerItemId, "provider item id"),
    canonicalUrl: exactUrl(input.canonicalUrl),
    title: exactIdentity(input.title, "title"),
    bodyPreview: exactText(input.bodyPreview, "body preview"),
    sourceText: exactText(input.sourceText, "source text"),
    ...(input.authorHandle === null
      ? {}
      : {
          authorHandle: exactIdentity(
            input.authorHandle,
            "author handle",
          ),
        }),
    sourceContentHash: exactSha256(
      input.sourceContentHash,
      "source content hash",
    ),
    sourceProviderContentHash:
      input.sourceProviderContentHash === null
        ? null
        : exactSha256(
            input.sourceProviderContentHash,
            "source provider content hash",
          ),
    publishedAt,
    observedAt: exactTimestamp(input.observedAt, "observed timestamp"),
  };
  const githubValues = [
    input.githubResultId,
    input.githubScanJobId,
    input.githubAttemptNumber,
    input.githubRepositoryIdentity,
    input.githubRank,
    input.githubCheckedAt,
  ];
  if (providerKey !== "github-trending-page") {
    if (githubValues.some((value) => value !== null)) {
      fail("non-GitHub evidence contains a GitHub tuple");
    }
    return Object.freeze(leaf);
  }
  if (githubValues.some((value) => value === null)) {
    fail("GitHub evidence lacks one successful result/attempt tuple");
  }
  return validateLeaf(
    {
      ...leaf,
      github: {
        resultId: input.githubResultId,
        scanJobId: input.githubScanJobId,
        scanAttemptNumber: input.githubAttemptNumber,
        repositoryIdentity: input.githubRepositoryIdentity,
        rank: input.githubRank,
        checkedAt: input.githubCheckedAt,
      },
    },
    "github-trending-page",
    requestedUtcDate,
  );
};
const validateLeaf = (
  input: unknown,
  expectedProvider: RecoveryTerminalManifestProviderKey,
  requestedUtcDate: string,
): RecoveryTerminalManifestLeaf => {
  assertRecord(input, "leaf");
  const providerKey = exactProvider(input.providerKey);
  assertExactObject(input, leafExpectedKeys(input), "leaf");
  if (providerKey !== expectedProvider) {
    fail("leaf provider diverged");
  }
  const publishedAt = exactTimestamp(input.publishedAt, "published timestamp");
  if (publishedAt.slice(0, 10) !== requestedUtcDate) {
    fail("leaf published timestamp is outside the selected day");
  }
  const leaf: RecoveryTerminalManifestLeaf = {
    providerKey,
    feedItemId: exactUuid(input.feedItemId, "feed item id"),
    sourceItemId: exactUuid(input.sourceItemId, "source item id"),
    sourceBindingId: exactUuid(input.sourceBindingId, "source binding id"),
    interestId: exactUuid(input.interestId, "interest id"),
    providerItemId: exactIdentity(input.providerItemId, "provider item id"),
    canonicalUrl: exactUrl(input.canonicalUrl),
    title: exactIdentity(input.title, "title"),
    bodyPreview: exactText(input.bodyPreview, "body preview"),
    sourceText: exactText(input.sourceText, "source text"),
    ...(Object.hasOwn(input, "authorHandle")
      ? {
          authorHandle: exactIdentity(
            input.authorHandle,
            "author handle",
          ),
        }
      : {}),
    sourceContentHash: exactSha256(
      input.sourceContentHash,
      "source content hash",
    ),
    sourceProviderContentHash:
      input.sourceProviderContentHash === null
        ? null
        : exactSha256(
            input.sourceProviderContentHash,
            "source provider content hash",
          ),
    publishedAt,
    observedAt: exactTimestamp(input.observedAt, "observed timestamp"),
  };
  if (providerKey !== "github-trending-page") {
    return Object.freeze(leaf);
  }
  assertExactObject(input.github, githubTupleKeys, "GitHub tuple");
  const github = Object.freeze({
    resultId: exactUuid(input.github.resultId, "GitHub result id"),
    scanJobId: exactUuid(input.github.scanJobId, "GitHub scan job id"),
    scanAttemptNumber: exactPositiveInteger(
      input.github.scanAttemptNumber,
      "GitHub attempt",
    ),
    repositoryIdentity: exactRepositoryIdentity(
      input.github.repositoryIdentity,
    ),
    rank: exactPositiveInteger(input.github.rank, "GitHub rank"),
    checkedAt: exactTimestamp(
      input.github.checkedAt,
      "GitHub checked timestamp",
    ),
  });
  if (github.checkedAt.slice(0, 10) !== requestedUtcDate) {
    fail("GitHub tuple is outside the selected day");
  }
  assertGitHubUrl(leaf.canonicalUrl, github.repositoryIdentity);
  return Object.freeze({ ...leaf, github });
};
const leafExpectedKeys = (
  input: Readonly<Record<string, unknown>>,
): readonly string[] => [
  ...leafKeys,
  ...(Object.hasOwn(input, "authorHandle") ? ["authorHandle"] : []),
  ...(input.providerKey === "github-trending-page" ? ["github"] : []),
];

const exactUtcDay = (
  input: unknown,
): Readonly<{ startedAt: string; endedAt: string; timezone: "UTC" }> => {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(input)) {
    fail("requested UTC date is malformed");
  }
  const startedAt = `${input}T00:00:00.000Z`;
  const started = new Date(startedAt);
  if (
    !Number.isFinite(started.getTime()) ||
    started.toISOString() !== startedAt
  ) {
    fail("requested UTC date is malformed");
  }
  return Object.freeze({
    startedAt,
    endedAt: new Date(started.getTime() + 86_400_000).toISOString(),
    timezone: "UTC",
  });
};

const exactSortedUniqueUuids = (
  input: unknown,
  label: string,
): readonly string[] => {
  assertReaderSummaryWeeklyDenseArray(input, `terminal manifest ${label}`);
  const values = input.map((value) => exactUuid(value, label));
  const sorted = [...values].sort(codeUnitCompare);
  if (
    values.some((value, index) => value !== sorted[index]) ||
    new Set(values).size !== values.length
  ) {
    fail(`${label} must be unique and code-unit sorted`);
  }
  return Object.freeze(values);
};

const exactProvider = (
  input: unknown,
): RecoveryTerminalManifestProviderKey => {
  if (
    typeof input !== "string" ||
    !recoveryTerminalManifestProviderKeys.includes(
      input as RecoveryTerminalManifestProviderKey,
    )
  ) {
    fail("provider is malformed");
  }
  return input as RecoveryTerminalManifestProviderKey;
};

const exactUuid = (input: unknown, label: string): string => {
  if (typeof input !== "string" || !uuidPattern.test(input)) {
    fail(`${label} is malformed`);
  }
  return input;
};

const exactIdentity = (input: unknown, label: string): string => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > 4_096 ||
    input !== input.trim()
  ) {
    fail(`${label} is malformed`);
  }
  return input;
};

const exactDigits = (input: unknown, label: string): string => {
  const value = exactIdentity(input, label);
  if (!/^[0-9]+$/u.test(value)) {
    fail(`${label} is malformed`);
  }
  return value;
};

const exactText = (input: unknown, label: string): string => {
  if (typeof input !== "string" || input.length > 1_000_000) {
    fail(`${label} is malformed`);
  }
  return input;
};

const exactUrl = (input: unknown): string => {
  const value = exactIdentity(input, "canonical URL");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("canonical URL is malformed");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.hostname.length === 0 ||
    parsed.username.length !== 0 ||
    parsed.password.length !== 0
  ) {
    fail("canonical URL is malformed");
  }
  return value;
};

const exactTimestamp = (input: unknown, label: string): string => {
  const value = input instanceof Date ? input.toISOString() : input;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    fail(`${label} is malformed`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`${label} is malformed`);
  }
  return value;
};

const exactSha256 = (input: unknown, label: string): string => {
  if (typeof input !== "string" || !sha256Pattern.test(input)) {
    fail(`${label} must be a lowercase SHA-256`);
  }
  return input;
};

const exactDatabaseIdentity = (input: unknown): string => {
  if (
    typeof input !== "string" ||
    !databaseIdentityPattern.test(input)
  ) {
    fail("scratch database identity is malformed");
  }
  return input;
};

const exactPositiveInteger = (input: unknown, label: string): number => {
  if (!Number.isSafeInteger(input) || Number(input) < 1) {
    fail(`${label} is malformed`);
  }
  return Number(input);
};

const exactRepositoryIdentity = (input: unknown): string => {
  const value = exactIdentity(input, "GitHub repository");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
    fail("GitHub repository is malformed");
  }
  return value;
};

const assertGitHubUrl = (
  url: string,
  repositoryIdentity: string,
): void => {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname.toLowerCase() !== "github.com" ||
    parsed.search.length !== 0 ||
    parsed.hash.length !== 0 ||
    parsed.pathname.replace(/\/$/u, "").toLowerCase() !==
      `/${repositoryIdentity}`.toLowerCase()
  ) {
    fail("GitHub tuple does not match canonical URL");
  }
};

function assertExactObject<TKey extends string>(
  input: unknown,
  expectedKeys: readonly TKey[],
  label: string,
): asserts input is Readonly<Record<TKey, unknown>> {
  assertReaderSummaryWeeklyExactObject(
    input,
    expectedKeys,
    `terminal manifest ${label}`,
    { allowAuthoritativeHashes: true },
  );
}

function assertRecord(
  input: unknown,
  label: string,
): asserts input is Readonly<Record<string, unknown>> {
  assertReaderSummaryWeeklyPlainObject(input, `terminal manifest ${label}`);
  readerSummaryWeeklyOwnDataKeys(input, `terminal manifest ${label}`);
}

const canonical = (input: unknown) =>
  canonicalizeReaderSummaryProductionRecoveryJson(
    input,
    "terminal manifest",
  );
function fail(reason: string): never {
  throw new Error(`Reader summary recovery terminal manifest ${reason}`);
}
