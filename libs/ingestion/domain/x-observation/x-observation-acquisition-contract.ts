import { xBounds, xDays, type XByteDigest, type XDigest, type XGrant, type XMetric, type XMetricName } from "./x-observation-contract";

export function xExactKeys(value: unknown, required: string, optional = ""): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value), needs = required.split(","), allowed = [...needs, ...optional.split(",")];
  return needs.every((key) => keys.includes(key)) && keys.every((key) => allowed.includes(key));
}
export const xHash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
export const xUuid = (value: string): boolean => /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value);
export const xDecimal = (value: unknown): value is string => typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value) && value.length <= 128;
export const xTime = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
export const xUnique = (values: readonly string[]): boolean => new Set(values).size === values.length;
export function xMetricValid(value: unknown): value is XMetric {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const metric = value as Record<string, unknown>;
  return metric.state === "OBSERVED" ? Object.keys(metric).sort().join() === "state,valueDecimal" && xDecimal(metric.valueDecimal) :
    Object.keys(metric).join() === "state" && ["MISSING", "MALFORMED", "CONFLICT"].includes(String(metric.state));
}

export type XSupplementaryCell = Readonly<{ day: string; sourceBindingId: string; interestId: string;
  scanPolicyId: string; scanJobId: string; predecessorArtifactHash: string;
  predecessorScanIdentity: string; targetItemCount: 100; queryIds: readonly string[] }>;
export type XSupplementaryQuery = Readonly<{ queryId: string; day: string; purpose: "SUPPLEMENTARY_ACQUISITION";
  sourceBindingId: string; queryHash: string; product: "TOP" | "LATEST"; pageLimit: number }>;
export type XSupplementary = Readonly<{ version: 1; cells: readonly XSupplementaryCell[];
  queries: readonly XSupplementaryQuery[]; ingestionPolicyHash: string }>;
// Supplied by the independent current-state reader, never by copying a proposed hash.
export type XPredecessorEvidence = Readonly<{ day: string; sourceBindingId: string; interestId: string;
  scanPolicyId: string; scanJobId: string; predecessorScanIdentity: string; targetItemCount: 100;
  predecessorArtifactBytes: readonly number[]; predecessorArtifact: unknown; acceptance: "ACCEPTED" | "BLOCKING" }>;
export type XAcquiredPost = Readonly<{ primaryId: string; canonicalUrl: string; publishedAt: string;
  authorHandle?: string; contentKind?: "ORIGINAL" | "REPLY" | "QUOTE"; text: string;
  metrics: Readonly<Record<XMetricName, XMetric>>; responseObservedAt: string;
  queryId: string; sourceBindingId: string }>;
export type XAcquisitionPayload = Readonly<{ schemaVersion: 2; acquiredPosts: readonly XAcquiredPost[] }>;
export const xUtf8Bytes = (value: string): number => new TextEncoder().encode(value).length;
export const xSupplementaryQuery = (grant: XGrant, day: string, queryId: string | undefined) =>
  grant.schemaVersion === 2 ? grant.supplementary.queries.find((q) => q.day === day && q.queryId === queryId) : undefined;

export function xSupplementaryValid(grant: XGrant, digest: XDigest): boolean {
  if (grant.schemaVersion !== 2) return true;
  const s = grant.supplementary;
  if (!xExactKeys(s, "version,cells,queries,ingestionPolicyHash") || s.version !== 1 || !xHash(s.ingestionPolicyHash) ||
      !Array.isArray(s.cells) || !s.cells.length || s.cells.length > 7 || !Array.isArray(s.queries) ||
      !s.queries.length || s.queries.length > 56 || !xUnique(s.cells.map((c) => c.day)) ||
      !xUnique(s.cells.map((c) => c.scanJobId)) || !xUnique(s.queries.map((q) => q.queryId))) return false;
  for (const c of s.cells) {
    if (!xExactKeys(c, "day,sourceBindingId,interestId,scanPolicyId,scanJobId,predecessorArtifactHash,predecessorScanIdentity,targetItemCount,queryIds") ||
        !(xDays as readonly string[]).includes(c.day) || ![c.sourceBindingId, c.interestId, c.scanPolicyId, c.scanJobId, c.predecessorScanIdentity].every(xUuid) ||
        !xHash(c.predecessorArtifactHash) || c.targetItemCount !== 100 || !Array.isArray(c.queryIds) ||
        !c.queryIds.length || !xUnique(c.queryIds) || c.queryIds.length > xBounds.queries ||
        c.queryIds.some((id: string) => !s.queries.some((q) => q.day === c.day && q.queryId === id && q.sourceBindingId === c.sourceBindingId))) return false;
  }
  return s.queries.every((q) => {
    const slot = grant.days.find((d) => d.day === q.day)?.queries.find((p) => p.queryId === q.queryId);
    return xExactKeys(q, "queryId,day,purpose,sourceBindingId,queryHash,product,pageLimit") &&
      q.purpose === "SUPPLEMENTARY_ACQUISITION" && !!slot && slot.targetKeys.length === 0 &&
      q.product === slot.product && q.queryHash === digest(slot) && Number.isInteger(q.pageLimit) &&
      q.pageLimit >= 1 && q.pageLimit <= xBounds.pages &&
      grant.days.every((d) => d.queries.every((p) => p.queryId !== q.queryId || (d.day === q.day && p.targetKeys.length === 0))) &&
      s.cells.some((c) => c.day === q.day && c.sourceBindingId === q.sourceBindingId && c.queryIds.includes(q.queryId));
  });
}

export function xPredecessorsMatch(grant: XGrant, evidence: readonly XPredecessorEvidence[],
  ingestionPolicy: unknown, digest: XDigest, byteDigest?: XByteDigest): boolean {
  if (grant.schemaVersion !== 2 || !byteDigest || typeof byteDigest.sha256 !== "function") return false;
  return !!ingestionPolicy && typeof ingestionPolicy === "object" && !Array.isArray(ingestionPolicy) && digest(ingestionPolicy) === grant.supplementary.ingestionPolicyHash &&
    evidence.length === grant.supplementary.cells.length && grant.supplementary.cells.every((c) => {
      const matches = evidence.filter((e) => e.day === c.day && e.sourceBindingId === c.sourceBindingId);
      if (matches.length !== 1) return false;
      const e = matches[0]!;
      return e.acceptance === "BLOCKING" && e.interestId === c.interestId && e.scanPolicyId === c.scanPolicyId &&
        e.scanJobId === c.scanJobId && e.predecessorScanIdentity === c.predecessorScanIdentity && e.targetItemCount === 100 &&
        !!e.predecessorArtifact && typeof e.predecessorArtifact === "object" &&
        xPredecessorBytesMatch(e, c.predecessorArtifactHash, digest, byteDigest) &&
        !grant.acceptedReceipts.some((r) => r.receiptId === e.predecessorScanIdentity ||
          (r.day === c.day && r.providerKey === "x-twitter" && r.sourceBindingId === c.sourceBindingId));
    });
}

// Hash the reader's original bytes, then verify its separately parsed semantic body.
function xPredecessorBytesMatch(e: XPredecessorEvidence, expected: string,
  digest: XDigest, byteDigest: XByteDigest): boolean {
  if (!Array.isArray(e.predecessorArtifactBytes) || !e.predecessorArtifactBytes.length ||
      !e.predecessorArtifactBytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) return false;
  try {
    const bytes = Uint8Array.from(e.predecessorArtifactBytes);
    return byteDigest.sha256(bytes) === expected &&
      digest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes))) === digest(e.predecessorArtifact);
  } catch { return false; }
}

export function xAcquiredPostValid(post: XAcquiredPost, query: XSupplementaryQuery, observedAt: string | undefined): boolean {
  return xExactKeys(post, "primaryId,canonicalUrl,publishedAt,text,metrics,responseObservedAt,queryId,sourceBindingId", "authorHandle,contentKind") &&
    xDecimal(post.primaryId) && post.primaryId !== "0" && typeof post.canonicalUrl === "string" && xUtf8Bytes(post.canonicalUrl) <= 8192 &&
    new RegExp(`^https://(?:x\\.com|twitter\\.com)/[A-Za-z0-9_]{1,15}/status/${post.primaryId}$`, "u").test(post.canonicalUrl) &&
    xTime(post.publishedAt) && post.publishedAt.startsWith(query.day) && xTime(post.responseObservedAt) && post.responseObservedAt === observedAt &&
    post.queryId === query.queryId && post.sourceBindingId === query.sourceBindingId &&
    typeof post.text === "string" && !/[\uD800-\uDFFF]/u.test(post.text) && xUtf8Bytes(post.text) <= 16384 &&
    (post.authorHandle === undefined || /^[A-Za-z0-9_]{1,15}$/u.test(post.authorHandle)) &&
    (post.contentKind === undefined || ["ORIGINAL", "REPLY", "QUOTE"].includes(post.contentKind)) &&
    xExactKeys(post.metrics, "likes,reposts,replies,quotes,views") && Object.values(post.metrics).every(xMetricValid);
}
