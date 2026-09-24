import { createHash } from "node:crypto";

import type { ReaderSummaryPublicationCommand } from "../../../ports";
import { canonicalReaderSummaryPreparationTimestamp,
  type ReaderPostPromotionAttestationV3 } from "../../../domain";
import { readerPostPresentationV3Identity, readerPostPresentationV3InputDigest,
  readerPostPresentationV3MatchesCard } from
  "../../../domain/services/reader-post-presentation-v3";
import type { PrismaReaderSummaryClient } from "./prisma-reader-summary-client";
import type { ReaderSummaryPublicationTransactionGuard } from
  "./prisma-reader-summary-publication";

type JobGuardRow = {
  readonly status: string;
  readonly reader_summary_artifact_id: string | null;
  readonly selection_strategy: string | null;
  readonly terminal_failure_code: string | null;
  readonly preparation_manifest: unknown | null;
  readonly preparation_config: unknown | null;
  readonly started_at: Date | null;
  readonly preparation_cutoff_at: string | null;
  readonly workspace_live: boolean;
  readonly tenant_live: boolean;
};

export const readerSummaryV3PublicationGuard:
ReaderSummaryPublicationTransactionGuard = async (
  client: PrismaReaderSummaryClient,
  command: ReaderSummaryPublicationCommand,
) => {
  const job = command.finalJob.toSnapshot();
  const artifact = command.artifact.toSnapshot();
  const rows = await client.$queryRaw<readonly JobGuardRow[]>`
    SELECT j.status, j.selection_strategy, j.terminal_failure_code,
      j.reader_summary_artifact_id::text, j.preparation_manifest,
      j.preparation_config, j.started_at,
      to_char(j.preparation_cutoff_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS preparation_cutoff_at,
      (w.deleted_at IS NULL) AS workspace_live,
      (t.deleted_at IS NULL) AS tenant_live
    FROM reader_summary_jobs j
    JOIN workspaces w ON w.tenant_id = j.tenant_id AND w.id = j.workspace_id
    JOIN tenants t ON t.id = w.tenant_id
    WHERE j.tenant_id = ${job.tenantId}::uuid
      AND j.workspace_id = ${job.workspaceId}::uuid AND j.id = ${job.id}::uuid
    FOR UPDATE OF j, w, t
  `;
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error("Reader summary publication scope changed");
  }
  if (row.selection_strategy !== "jev_primary_v3") return { allowed: true };
  const expectedTerminalStatus = job.status === "completed" ? "COMPLETED"
    : job.status === "no_signal" ? "NO_SIGNAL" : undefined;
  if (row.status === "COMPLETED" || row.status === "NO_SIGNAL") {
    if (row.status !== expectedTerminalStatus ||
        row.reader_summary_artifact_id !== artifact.readerSummaryId ||
        row.terminal_failure_code !== null) {
      throw new Error("Reader summary publication replay identity changed");
    }
    return { allowed: true };
  }
  if (row.status === "FAILED") {
    return { allowed: false, reason: terminalRejectionReason(
      row.terminal_failure_code) };
  }
  if (row.status !== "RUNNING" || row.terminal_failure_code !== null ||
      row.preparation_manifest === null || row.preparation_config === null ||
      row.started_at?.getTime() !== job.startedAt?.getTime() ||
      !row.workspace_live || !row.tenant_live) {
    return reject(client, job, "scope_changed");
  }
  const attestations = artifact.promotionAttestations ?? [];
  const isNoSignal = artifact.qualityFlags.includes("no_signal");
  if (attestations.some((attestation) =>
      attestation.schemaVersion !== "reader_post_promotion_attestation.v3") ||
      (!isNoSignal && attestations.length === 0) ||
      (isNoSignal && attestations.length !== 0)) {
    return reject(client, job, "config_unavailable");
  }

  const config = record(row.preparation_config);
  const interestId = config.interestId;
  const interestSha256 = config.interestSha256;
  if (typeof interestId !== "string" || typeof interestSha256 !== "string") {
    return reject(client, job, "config_unavailable");
  }
  const interests = await client.$queryRaw<readonly {
    readonly query: string;
    readonly status: string;
    readonly deleted_at: Date | null;
  }[]>`
    SELECT i.query, i.status, i.deleted_at FROM interests i
    WHERE i.tenant_id = ${job.tenantId}::uuid
      AND i.workspace_id = ${job.workspaceId}::uuid AND i.id = ${interestId}::uuid
    FOR NO KEY UPDATE OF i
  `;
  const interest = interests[0];
  if (interests.length !== 1 || interest === undefined || interest.deleted_at !== null ||
      interest.status !== "ENABLED" || sha256(interest.query) !== interestSha256) {
    return reject(client, job, "interest_changed");
  }

  const manifest = record(row.preparation_manifest);
  const authoritativeCutoff = row.preparation_cutoff_at;
  if (authoritativeCutoff === null ||
      canonicalTimestamp(manifest.cutoffAt) !== authoritativeCutoff ||
      artifact.sourceWindow.exactIngestionCutoff !== authoritativeCutoff ||
      artifact.sourceWindow.ingestionCutoff?.getTime() !==
        Date.parse(authoritativeCutoff) ||
      attestations.some((attestation) =>
        attestation.exactIngestionCutoff !== authoritativeCutoff ||
        attestation.ingestionCutoff.getTime() !== Date.parse(authoritativeCutoff))) {
    return reject(client, job, "config_unavailable");
  }
  const candidates = manifest.candidates;
  if (!Array.isArray(candidates) || candidates.length > 1_000) {
    return reject(client, job, "config_unavailable");
  }
  const candidateIds = candidates.map((candidate) => record(candidate).candidateId);
  if (candidateIds.some((id) => typeof id !== "string") ||
      candidates.some((value) => typeof record(value).assessmentId !== "string")) {
    return reject(client, job, "config_unavailable");
  }
  const visible = await client.$queryRaw<readonly { readonly id: string }[]>`
    SELECT f.id::text AS id FROM feed_items f
    JOIN source_items s ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id
      AND s.id=f.source_item_id AND s.provider_key=f.provider_key
    JOIN source_bindings b ON b.tenant_id=f.tenant_id
      AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
      AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL
    JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id
      AND c.provider_key=f.provider_key
    WHERE f.tenant_id=${job.tenantId}::uuid AND f.workspace_id=${job.workspaceId}::uuid
      AND f.interest_id=${interestId}::uuid
      AND f.id=ANY(${candidateIds}::uuid[]) AND f.status='VISIBLE'
      AND COALESCE(s.metadata->>'deleted','false') <> 'true'
      AND COALESCE(s.metadata->>'dead','false') <> 'true'
      AND COALESCE(s.metadata->>'banned','false') <> 'true'
      AND NOT EXISTS (SELECT 1 FROM feed_items revoked
        WHERE revoked.tenant_id=f.tenant_id AND revoked.workspace_id=f.workspace_id
          AND revoked.interest_id=f.interest_id AND revoked.source_item_id=f.source_item_id
          AND revoked.status='TOMBSTONED')
    -- A publication is allowed only while every frozen candidate remains
    -- visible. KEY SHARE would allow the ordinary non-key UPDATE used by
    -- tombstoning/status/metadata revocation. Keep these fences only in the
    -- short serializable final-publication transaction, after model work.
    ORDER BY f.id FOR NO KEY UPDATE OF f,s,b
  `;
  if (visible.length !== candidateIds.length) {
    return reject(client, job, "scope_changed");
  }
  const manifestByCandidate = new Map(candidates.map((value) => {
    const candidate = record(value);
    return [candidate.candidateId, candidate] as const;
  }));
  const assessmentIds = [...new Set(candidates.map((value) =>
    record(value).assessmentId as string))].sort();
  const assessments = assessmentIds.length === 0 ? [] : await client.$queryRaw<readonly AssessmentGuardRow[]>`
    SELECT a.id::text, a.interest_id::text, a.source_item_id::text,
      a.source_snapshot_sha256, a.input_sha256, a.rubric_version,
      a.rubric_sha256, a.model_config_version, a.result, a.input_snapshot,
      to_char(a.assessed_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS assessed_at
    FROM reader_value_assessments a
    WHERE a.tenant_id=${job.tenantId}::uuid
      AND a.workspace_id=${job.workspaceId}::uuid
      AND a.interest_id=${interestId}::uuid
      AND a.id=ANY(${assessmentIds}::uuid[])
      AND a.state='assessed' AND ${job.id}::uuid=ANY(a.pinned_job_ids)
    ORDER BY a.id FOR SHARE OF a
  `;
  if (assessments.length !== assessmentIds.length) {
    return reject(client, job, "config_unavailable");
  }
  const assessmentById = new Map(assessments.map((value) => [value.id, value]));
  for (const attestation of artifact.promotionAttestations ?? []) {
    const candidate = manifestByCandidate.get(attestation.candidateId);
    const assessment = typeof candidate?.assessmentId === "string"
      ? assessmentById.get(candidate.assessmentId) : undefined;
    const card = [...(artifact.content?.topReads ?? []),
      ...(artifact.content?.selectedPosts ?? [])].find((value) =>
      value.promotionCandidateId === attestation.candidateId);
    if (candidate === undefined || attestation.schemaVersion !==
        "reader_post_promotion_attestation.v3" ||
        assessment === undefined ||
        candidate.assessmentId !== attestation.assessment.assessmentId ||
        candidate.sourceSnapshotSha256 !==
          attestation.assessment.sourceSnapshotSha256 ||
        candidate.inputSha256 !== attestation.assessment.inputSha256 ||
        manifest.rubricSha256 !== attestation.assessment.rubricSha256 ||
        manifest.modelConfigVersion !== attestation.assessment.modelConfigVersion ||
        !assessmentMatchesAttestation({ assessment, attestation, candidate, card,
          tenantId: job.tenantId, workspaceId: job.workspaceId,
          interestId })) {
      return reject(client, job, "config_unavailable");
    }
  }
  return { allowed: true };
};

type AssessmentGuardRow = {
  readonly id: string;
  readonly interest_id: string;
  readonly source_item_id: string;
  readonly source_snapshot_sha256: string;
  readonly input_sha256: string;
  readonly rubric_version: string;
  readonly rubric_sha256: string;
  readonly model_config_version: string;
  readonly assessed_at: string;
  readonly result: unknown;
  readonly input_snapshot: unknown;
};

const assessmentMatchesAttestation = (params: {
  readonly assessment: AssessmentGuardRow;
  readonly attestation: ReaderPostPromotionAttestationV3;
  readonly candidate: Record<string, unknown>;
  readonly card: unknown;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly interestId: string;
}): boolean => {
  const { assessment, attestation, candidate } = params;
  const snapshot = optionalRecord(assessment.input_snapshot);
  const capture = optionalRecord(snapshot?.capture);
  if (snapshot === undefined || capture === undefined ||
      typeof snapshot.title !== "string" || typeof snapshot.body !== "string" ||
      typeof snapshot.interest !== "string" || typeof snapshot.safety !== "string" ||
      typeof snapshot.retainedSnapshotTruncated !== "boolean" ||
      typeof capture.availability !== "string" ||
      typeof candidate.sourceItemId !== "string" ||
      typeof candidate.sourceBindingId !== "string" ||
      typeof candidate.providerKey !== "string" ||
      typeof candidate.publishedAt !== "string") return false;
  const presentationInputDigest = readerPostPresentationV3InputDigest({
    tenantId: params.tenantId, workspaceId: params.workspaceId,
    interestId: params.interestId, candidateId: attestation.candidateId,
    sourceItemId: candidate.sourceItemId,
    sourceBindingId: candidate.sourceBindingId,
    providerKey: candidate.providerKey,
    trustedIntent: snapshot.interest,
    sourceSnapshotSha256: assessment.source_snapshot_sha256,
    title: snapshot.title, body: snapshot.body,
    captureComplete: snapshot.safety !== "blocked" &&
      !snapshot.retainedSnapshotTruncated && capture.availability !== "truncated",
  });
  const card = optionalRecord(params.card);
  const source = optionalRecord(card?.capturedSource);
  const headline = card?.displayHeadline;
  const result = optionalRecord(assessment.result);
  const usefulness = optionalRecord(result?.usefulness);
  const relevance = optionalRecord(result?.relevance);
  return result !== undefined && usefulness !== undefined && relevance !== undefined &&
    assessment.id === attestation.assessment.assessmentId &&
    assessment.interest_id === params.interestId &&
    assessment.source_item_id === candidate.sourceItemId &&
    assessment.source_snapshot_sha256 === attestation.assessment.sourceSnapshotSha256 &&
    assessment.input_sha256 === attestation.assessment.inputSha256 &&
    assessment.rubric_version === attestation.assessment.rubricVersion &&
    assessment.rubric_sha256 === attestation.assessment.rubricSha256 &&
    assessment.model_config_version === attestation.assessment.modelConfigVersion &&
    assessment.assessed_at === attestation.assessment.assessedAt &&
    stableJson(assessment.result) === stableJson(attestation.assessment.answers) &&
    attestation.comparator.usefulness === usefulness.choice &&
    attestation.comparator.relevance === relevance.choice &&
    attestation.comparator.publishedAt === candidate.publishedAt &&
    attestation.comparator.candidateId === attestation.candidateId &&
    attestation.presentation.presentationInputDigest === presentationInputDigest &&
    attestation.presentation.presentationIdentity === readerPostPresentationV3Identity({
      sourceSnapshotSha256: assessment.source_snapshot_sha256,
      presentationInputDigest,
      displayHeadline: attestation.presentation.displayHeadline,
    }) &&
    card !== undefined && source !== undefined &&
    source.title === snapshot.title && source.body === snapshot.body &&
    source.captureAvailability === "available" &&
    source.reviewAvailability === (snapshot.body.trim().length === 0 ? "title_only" : "body_present") &&
    typeof card.title === "string" && card.providerKey === candidate.providerKey &&
    card.promotionCandidateId === attestation.candidateId &&
    card.exactPublishedAt === attestation.publishedAt &&
    readerPostPresentationV3MatchesCard({
      title: card.title, providerKey: card.providerKey as string,
      candidateId: card.promotionCandidateId as string,
      capturedSource: source as never, headline: headline as never,
      seal: attestation.presentation.displayHeadline,
      tenantId: params.tenantId, workspaceId: params.workspaceId,
      trustedIntent: snapshot.interest,
    });
};

const reject = async (
  client: PrismaReaderSummaryClient,
  job: ReturnType<ReaderSummaryPublicationCommand["finalJob"]["toSnapshot"]>,
  reason: "scope_changed" | "interest_changed" | "config_unavailable",
): Promise<{ readonly allowed: false; readonly reason: string }> => {
  await client.$queryRaw`
    UPDATE reader_summary_jobs SET status='FAILED', failed_at=clock_timestamp(),
      failure_reason=${reason}, terminal_failure_code=${reason}
    WHERE tenant_id=${job.tenantId}::uuid AND workspace_id=${job.workspaceId}::uuid
      AND id=${job.id}::uuid AND status='RUNNING'
      AND started_at=${job.startedAt}::timestamptz RETURNING id
  `;
  return { allowed: false, reason };
};

const record = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Reader summary V3 guard payload is invalid");
  }
  return value as Record<string, unknown>;
};

const optionalRecord = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;

const stableJson = (value: unknown): string => JSON.stringify(sortJson(value));

const sortJson = (value: unknown): unknown => Array.isArray(value)
  ? value.map(sortJson)
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]))
    : value;

const canonicalTimestamp = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  try {
    return canonicalReaderSummaryPreparationTimestamp(value);
  } catch {
    return undefined;
  }
};

const terminalRejectionReason = (value: string | null):
"scope_changed" | "interest_changed" | "config_unavailable" =>
  value === "interest_changed" || value === "config_unavailable"
    ? value : "scope_changed";

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");
