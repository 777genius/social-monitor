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

// Dependencies are supplied by manifest validation, avoiding a runtime cycle.
export function assertRefreshSuccessorGrant(
  m: Omit<RefreshManifest, "operation">, now: Date,
  deps: { assertOriginal(m: RefreshManifest, now: Date, fresh: boolean): void; hash(value: unknown): string },
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
  if (!Number.isFinite(expires.getTime()) || expires.toISOString() !== grant.expiresAt ||
      expires.getTime() <= now.getTime() ||
      expires.getTime() <= Date.parse(m.preparedAt) ||
      expires.getTime() > Date.parse(m.preparedAt) + 30 * 60_000) {
    throw new Error("Refresh successor grant is expired or has invalid expiry");
  }
  const original = JSON.parse(grant.originalManifestJson) as RefreshManifest;
  if (!original || original.successor !== undefined) {
    throw new Error("Refresh successor cannot authorize a successor chain");
  }
  deps.assertOriginal(original, now, false);
  if (original.date !== m.date || original.tenantId !== m.tenantId || original.workspaceId !== m.workspaceId ||
      original.startedAt !== m.startedAt || original.endedAt !== m.endedAt || original.timezone !== m.timezone ||
      deps.hash(original.prior) !== deps.hash(m.prior) || deps.hash(original.authority) !== deps.hash(m.authority)) {
    throw new Error("Refresh successor prior/input differs from the original authority");
  }
  return original;
}
