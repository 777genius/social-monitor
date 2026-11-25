import type { RefreshManifest } from "./reader-summary-new-input-refresh-manifest";

/** Explicit operator evidence, reviewed as part of the immutable manifest.
 * There is no caller-chosen grant ID: the reconciliation is unique per job. */
export type RefreshSuccessorGrant = Readonly<{
  format: "reader-summary-new-input-refresh-successor-v1";
  originalJobId: string;
  reconciliationId: string;
  originalManifestJson: string;
  expiresAt: string;
}>;

export function refreshSuccessorIdentity(grant: RefreshSuccessorGrant) {
  const original = JSON.parse(grant.originalManifestJson) as RefreshManifest;
  return { format: "reader-summary-new-input-refresh-successor-v1",
    originalOperation: original.operation, originalJobId: grant.originalJobId,
    reconciliationId: grant.reconciliationId };
}

/** A successor chain is bounded to exactly two stages: the manifest under
 * active preparation (depth 0) may authorize against an original that is
 * itself a successor (the resumed first attempt), but that nested original's
 * own original must be a root with no further successor. Depth counts hops
 * already unwrapped by the caller, so depth 1 is the deepest nested grant
 * this function will ever unwrap; anything past it is an unbounded chain. */
const nestedGrantDepthLimit = 1;

// Dependencies are supplied by manifest validation, avoiding a runtime cycle.
export function assertRefreshSuccessorGrant(
  m: Omit<RefreshManifest, "operation">, now: Date,
  deps: { assertOriginal(m: RefreshManifest, now: Date, fresh: boolean, depth: number): void; hash(value: unknown): string },
  depth = 0,
): RefreshManifest {
  const grant = m.successor;
  const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
  if (!grant || typeof grant !== "object" ||
      Object.keys(grant).sort().join(",") !==
        "expiresAt,format,originalJobId,originalManifestJson,reconciliationId" ||
      grant.format !== "reader-summary-new-input-refresh-successor-v1" ||
      !uuid.test(grant.originalJobId) || !uuid.test(grant.reconciliationId) ||
      typeof grant.originalManifestJson !== "string" || typeof grant.expiresAt !== "string") {
    throw new Error("Refresh successor grant is malformed");
  }
  const expires = new Date(grant.expiresAt);
  // A nested (depth > 0) grant already lived out its window when its own
  // successor was consumed; only its bounded shape is re-checked here, never
  // whether it is still open right now.
  if (!Number.isFinite(expires.getTime()) || expires.toISOString() !== grant.expiresAt ||
      (depth === 0 && expires.getTime() <= now.getTime()) ||
      expires.getTime() <= Date.parse(m.preparedAt) ||
      expires.getTime() > Date.parse(m.preparedAt) + 30 * 60_000) {
    throw new Error("Refresh successor grant is expired or has invalid expiry");
  }
  const original = JSON.parse(grant.originalManifestJson) as RefreshManifest;
  if (!original) {
    throw new Error("Refresh successor cannot authorize a successor chain");
  }
  if (original.successor !== undefined) {
    if (depth >= nestedGrantDepthLimit) {
      throw new Error("Refresh successor chain depth exceeds the bounded two-stage recovery limit");
    }
    if (grant.originalJobId === original.successor.originalJobId ||
        grant.reconciliationId === original.successor.reconciliationId) {
      throw new Error("Refresh successor chain cannot reuse the same original reconciliation");
    }
  }
  deps.assertOriginal(original, now, false, depth + 1);
  if (original.date !== m.date || original.tenantId !== m.tenantId || original.workspaceId !== m.workspaceId ||
      original.startedAt !== m.startedAt || original.endedAt !== m.endedAt || original.timezone !== m.timezone ||
      deps.hash(original.prior) !== deps.hash(m.prior) || deps.hash(original.authority) !== deps.hash(m.authority)) {
    throw new Error("Refresh successor prior/input differs from the original authority");
  }
  return original;
}
