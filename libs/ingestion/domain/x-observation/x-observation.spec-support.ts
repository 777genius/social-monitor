import type { XPredecessorEvidence } from "./x-observation-acquisition-contract";
import { xDays, xOperationId, xTenantId, xWorkspaceId, type XGrant, type XTarget, type XSendOffer, type XSendOutcome } from "./x-observation-contract";
import { createHash } from "node:crypto";
// Test-only semantic digest: JSON fixtures below use canonical insertion order only for comparisons.
export const digest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const byteDigest = { sha256: (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex") };
export const fixtureHash = "a".repeat(64);
export const fixtureNow = "2026-09-08T12:00:00.000Z";
export function targetFixture(index = 1): XTarget {
  const sourceItemId = `00000000-0000-7000-8000-${String(index).padStart(12, "0")}`;
  return { targetKey: sourceItemId, sourceItemId, sourceBindingId: "00000000-0000-7000-8000-000000000101",
    tenantId: xTenantId, workspaceId: xWorkspaceId, externalId: String(index), canonicalUrl: `https://x.com/fixture/status/${index}`,
    publishedAt: "2026-08-30T04:00:00.000Z", contentHash: fixtureHash, configHash: fixtureHash,
    authorityHash: fixtureHash, queryHash: fixtureHash, fanoutHash: fixtureHash, feedIds: [],
    latestObservedAt: null, latestMetricsHash: null, sourceObservedAt: null, requiredMetrics: ["likes", "reposts", "replies"] };
}
export function grantFixture(targets: readonly XTarget[] = [targetFixture()]): XGrant {
  const release = { dependencyHash: fixtureHash, manifestHash: fixtureHash, profileHash: fixtureHash,
    implementationHash: fixtureHash, accountRef: "fixture-account", accountIdentityHash: fixtureHash,
    transportAttestationHash: fixtureHash, laneBGatesHash: fixtureHash, readOnlyEvidenceViewHash: fixtureHash,
    serviceIdentityHash: fixtureHash, accountExclusionHash: fixtureHash, childContainmentHash: fixtureHash };
  const days = xDays.map((day, i) => ({ day, epoch: i + 1, queries: targets.some((target) => target.publishedAt.startsWith(day)) ?
    [{ queryId: "q", query: "fixture", product: "LATEST" as const, targetKeys: targets.filter((target) => target.publishedAt.startsWith(day)).map((target) => target.targetKey) }] : [] }));
  return { schemaVersion: 1, operationId: xOperationId, tenantId: xTenantId, workspaceId: xWorkspaceId,
    release, days, targets, acceptedReceipts: [], inventoryHash: digest(targets), queryPlanHash: digest(days),
    acceptedReceiptsHash: digest([]), releaseHash: digest(release) };
}
export const offerFixture = (stage: XSendOffer["stage"] = "HOME", sequence = 1): XSendOffer => ({ operationId: xOperationId,
  batchId: xDays[0], epoch: 1, sequence, stage, requestDigest: fixtureHash,
  destinationRuleId: ({ HOME: "home", JS: "ondemand", SEARCH: "search", MIGRATION_GET: "migration-get", MIGRATION_POST: "migration-post", BOOTSTRAP_REDIRECT: "bootstrap-redirect" })[stage],
  accountRef: "fixture-account", timeoutMs: 10000, ...(stage === "SEARCH" ? { queryId: "q", pageIndex: 0 } : {}) });
export function outcomeFixture(offer = offerFixture()): XSendOutcome {
  const data = { operationId: xOperationId, batchId: offer.batchId, sequence: offer.sequence,
    reservationHash: fixtureHash, requestDigest: offer.requestDigest, stage: offer.stage,
    startedAt: fixtureNow, endedAt: fixtureNow, responseObservedAt: fixtureNow, outcome: "SUCCESS" as const,
    statusCode: 200, encodedBytes: 0, decodedBytes: 0, headerBytes: 0,
    ...(offer.stage === "SEARCH" ? { candidateCount: 0 } : {}), cursorState: "NONE" as const,
    reducedObservations: [], targetOutcomes: [], chunkIndex: 0, finalChunk: true };
  return { ...data, resultHash: digest(data) };
}

export function acquisitionFixture(digestFn = digest) {
  const original = grantFixture();
  const base = { ...original, releaseHash: digestFn(original.release), acceptedReceiptsHash: digestFn(original.acceptedReceipts) };
  const targets = base.targets.map((t) => ({ ...t, storageKey: `x-twitter:${t.externalId}` }));
  const slot = { queryId: "supplement", query: "synthetic public fixture", product: "LATEST" as const, targetKeys: [] };
  const days = base.days.map((d, i) => i === 0 ? { ...d, queries: [...d.queries, slot] } : d);
  const id = "00000000-0000-7000-8000-000000000201";
  const artifact = { synthetic: true, state: "BLOCKING", count: 50 };
  const artifactBytes = [...new TextEncoder().encode(JSON.stringify(artifact))];
  const policy = { syntheticPolicy: 1 };
  const cell = { day: days[0]!.day, sourceBindingId: targets[0]!.sourceBindingId, interestId: id,
    scanPolicyId: id, scanJobId: id, predecessorScanIdentity: id, predecessorArtifactHash: byteDigest.sha256(Uint8Array.from(artifactBytes)),
    targetItemCount: 100 as const, queryIds: [slot.queryId] };
  const query = { queryId: slot.queryId, day: cell.day, purpose: "SUPPLEMENTARY_ACQUISITION" as const,
    sourceBindingId: cell.sourceBindingId, queryHash: digestFn(slot), product: slot.product, pageLimit: 5 };
  const grant: XGrant = { ...base, schemaVersion: 2, targets, days, inventoryHash: digestFn(targets), queryPlanHash: digestFn(days),
    supplementary: { version: 1, cells: [cell], queries: [query], ingestionPolicyHash: digestFn(policy) } };
  const evidence: XPredecessorEvidence = { day: cell.day, sourceBindingId: cell.sourceBindingId, interestId: id,
    scanPolicyId: id, scanJobId: id, predecessorScanIdentity: id, targetItemCount: 100,
    predecessorArtifactBytes: artifactBytes, predecessorArtifact: artifact, acceptance: "BLOCKING" };
  const current = { ...grant, byteDigest, operationState: "UNADMITTED" as const, predecessors: [evidence], ingestionPolicy: policy };
  const missing = { state: "MISSING" as const };
  const post = { primaryId: "201", canonicalUrl: "https://x.com/fixture/status/201", text: "synthetic public fixture",
    publishedAt: "2026-08-30T01:00:00.000Z", responseObservedAt: fixtureNow,
    queryId: slot.queryId, sourceBindingId: cell.sourceBindingId,
    metrics: { likes: missing, reposts: missing, replies: missing, quotes: missing, views: missing } };
  return { grant, current, query, post };
}
