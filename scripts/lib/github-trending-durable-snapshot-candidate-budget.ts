export type GitHubTrendingDurableSnapshotCandidate = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly sourceTenantId: string;
  readonly sourceWorkspaceId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly feedSourceBindingId: string;
  readonly sourceSourceBindingId: string;
  readonly feedProviderKey: string;
  readonly sourceProviderKey: string;
  readonly feedStatus: string;
  readonly providerItemId: string;
  readonly canonicalUrl: string;
  readonly metadataKind: string;
  readonly repositoryFullName: string;
  readonly repositoryUrl: string;
  readonly rank: number;
  readonly starsGained: number;
  readonly totalStars: number;
  readonly window: string;
  readonly scanJobId: string;
  readonly feedScanJobId: string;
  readonly fetchStartedAt: string;
  readonly feedFetchStartedAt: string;
  readonly checkedAt: string;
  readonly feedCheckedAt: string;
  readonly publishedAt: string;
  readonly sourcePublishedAt: string;
  readonly feedObservedAt: string;
  readonly sourceObservedAt: string;
  readonly scanJobStatus: string;
  readonly scanJobTenantId: string;
  readonly scanJobWorkspaceId: string;
  readonly scanJobSourceBindingId: string;
  readonly sourceContentHash: string;
  readonly sourceProviderContentHash: string;
  readonly sourceTitle: string;
  readonly feedTitle: string;
  readonly bodyPreview: string;
  readonly sourceTitleBytes: number;
  readonly feedTitleBytes: number;
  readonly bodyPreviewBytes: number;
  readonly feedSnapshotSourceBindingId: string;
  readonly feedSnapshotProviderKey: string;
};

export const githubTrendingDurableSnapshotRowLimit = 200;

// PostgreSQL left(text, n) counts Unicode code points, not UTF-16 units.
// UUIDs have 36 ASCII characters; normalized Date ISO strings need at most 27.
// These are transport bounds (including invalid-value sentinels), not eligibility.
export const githubTrendingCandidateFieldBounds = {
  tenantId: 36,
  workspaceId: 36,
  sourceTenantId: 36,
  sourceWorkspaceId: 36,
  feedItemId: 36,
  sourceItemId: 36,
  feedSourceBindingId: 36,
  sourceSourceBindingId: 36,
  feedProviderKey: 64,
  sourceProviderKey: 64,
  feedStatus: 32,
  providerItemId: 256,
  canonicalUrl: 256,
  metadataKind: 128,
  repositoryFullName: 256,
  repositoryUrl: 256,
  rank: "number",
  starsGained: "number",
  totalStars: "number",
  window: 32,
  scanJobId: 256,
  feedScanJobId: 256,
  fetchStartedAt: 64,
  feedFetchStartedAt: 64,
  checkedAt: 64,
  feedCheckedAt: 64,
  publishedAt: 27,
  sourcePublishedAt: 27,
  feedObservedAt: 27,
  sourceObservedAt: 27,
  scanJobStatus: 32,
  scanJobTenantId: 36,
  scanJobWorkspaceId: 36,
  scanJobSourceBindingId: 36,
  sourceContentHash: 128,
  sourceProviderContentHash: 128,
  sourceTitle: 513,
  feedTitle: 513,
  bodyPreview: 4097,
  sourceTitleBytes: "number",
  feedTitleBytes: "number",
  bodyPreviewBytes: "number",
  feedSnapshotSourceBindingId: 256,
  feedSnapshotProviderKey: 64,
} as const satisfies {
  readonly [K in keyof GitHubTrendingDurableSnapshotCandidate]:
    GitHubTrendingDurableSnapshotCandidate[K] extends number ? "number" : number;
};

const fields = Object.entries(githubTrendingCandidateFieldBounds);
// A code point takes <=4 UTF-8 bytes unescaped, <=6 as a JSON control escape.
// Lone UTF-16 surrogates also serialize as six bytes. Quotes/backslashes take two.
// NumberToString takes <=25 ASCII bytes (sign + fixed/exponent notation).
// Each property contributes its quoted key, colon, value, and comma; the final
// comma is replaced by '}', leaving one extra byte for the opening '{'.
export const githubTrendingCandidateRowJsonByteLimit = 1 + fields.reduce(
  (bytes, [key, bound]) => bytes + Buffer.byteLength(JSON.stringify(key), "utf8") +
    2 + (bound === "number" ? 25 : 2 + 6 * bound),
  0,
);
export const githubTrendingCandidateJsonByteLimit = 1 +
  githubTrendingDurableSnapshotRowLimit * (githubTrendingCandidateRowJsonByteLimit + 1);

export const githubTrendingDurableSnapshotCandidatesFitBudget = (
  rows: readonly GitHubTrendingDurableSnapshotCandidate[],
): boolean => {
  // Check count BEFORE visiting rows or allocating JSON. The SQL fetches only
  // 201 rows, with independently bounded columns, to expose overflow.
  if (rows.length > githubTrendingDurableSnapshotRowLimit) return false;
  let jsonBytes = 1;
  for (const row of rows) {
    if (row === null || typeof row !== "object") return false;
    const keys = Object.keys(row);
    if (keys.length !== fields.length ||
      keys.some((key) => !Object.hasOwn(githubTrendingCandidateFieldBounds, key))) return false;
    let rowBytes = 1;
    for (const [key, bound] of fields) {
      const value: unknown = row[key as keyof GitHubTrendingDurableSnapshotCandidate];
      if (bound === "number") {
        if (typeof value !== "number") return false;
      } else if (value !== null && !boundedCodePoints(value, bound)) {
        // SQL NULL is bounded evidence too; the existing verifier decides its
        // eligibility. Never coalesce nullable content into apparently valid text.
        return false;
      }
      // Capture and serialize only this bounded primitive, so neither an array
      // nor an object serializer can allocate an unchecked payload. Keys are ASCII.
      rowBytes += key.length + 4 + Buffer.byteLength(JSON.stringify(value), "utf8");
    }
    if (rowBytes > githubTrendingCandidateRowJsonByteLimit) return false;
    jsonBytes += rowBytes + 1;
    if (jsonBytes > githubTrendingCandidateJsonByteLimit) return false;
  }
  return true;
};

const boundedCodePoints = (value: unknown, limit: number): boolean => {
  if (typeof value !== "string" || value.length > 2 * limit) return false;
  let count = 0;
  for (let index = 0; index < value.length; index += 1) {
    count += 1;
    if (count > limit) return false;
    if (value.codePointAt(index)! > 0xffff) index += 1;
  }
  return true;
};
