import type { ReaderValuePreparedInput } from "../../libs/relevance/application/contracts/reader-value-assessment-store";
import type { ReaderPostPromotionV3Candidate } from "../../libs/summary/domain";
import type { ReaderSummaryPublicationPostgresClient } from "./reader-summary-publication-postgres-fixture-scope";
import { sha256 } from "./reader-summary-weekly-publication-evidence-postgres-contract";

export const persistV3FixtureAssessment = async (
  client: ReaderSummaryPublicationPostgresClient,
  candidate: ReaderPostPromotionV3Candidate,
  source: { readonly tenantId: string; readonly workspaceId: string; readonly interestId: string;
    readonly trustedIntent: string; readonly title: string; readonly body: string },
  prepared?: ReaderValuePreparedInput,
): Promise<void> => {
  const assessmentSnapshot = prepared?.snapshot ?? {
    sourceSnapshotSha256: candidate.sourceSnapshotSha256,
    interestSha256: sha256(source.trustedIntent),
    sanitizedTextSha256: sha256(`${source.title}\n${source.body}`),
    title: source.title, body: source.body, interest: source.trustedIntent,
    capture: { representationVersion: "capture.v1", availability: "complete",
      segments: [] },
    availableAt: candidate.publishedAt, originalTitleLength: source.title.length,
    originalBodyLength: source.body.length, retainedSnapshotTruncated: false,
    safety: "allowed",
  };
  await client.query(`INSERT INTO reader_value_assessments(
      id,tenant_id,workspace_id,interest_id,source_item_id,source_revision_key,
      source_snapshot_sha256,interest_sha256,rubric_version,rubric_sha256,
      input_builder_version,model_config_version,input_sha256,request_sha256,
      input_snapshot,request_body,state,attempts,attempt_history,next_attempt_at,
      usefulness,relevance,context_sufficiency,evidence_basis,result,
      requested_model,resolved_model,provider,assessed_at,expires_at)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5::uuid,'publication-fixture',
      $6,$7,$8,$9,$20,$10,$11,$12,$13::jsonb,$21,'assessed',0,'[]',
      clock_timestamp(),$14,$15,$16,$17,$18::jsonb,'fixture-model','fixture-model',
      'fixture',$19::timestamptz,CURRENT_TIMESTAMP+interval '180 days')`, [
    candidate.assessmentId, source.tenantId, source.workspaceId,
    source.interestId, candidate.sourceItemId, candidate.sourceSnapshotSha256,
    assessmentSnapshot.interestSha256, candidate.rubricVersion,
    candidate.rubricSha256, candidate.modelConfigVersion, candidate.inputSha256,
    prepared?.requestSha256 ?? sha256("{}"), JSON.stringify(assessmentSnapshot),
    candidate.answers.usefulness.choice, candidate.answers.relevance.choice,
    candidate.answers.context_sufficiency.choice,
    candidate.answers.evidence_basis.choice, JSON.stringify(candidate.answers),
    candidate.assessedAt, prepared?.inputBuilderVersion ?? "input.v1", prepared?.requestBody ?? "{}",
  ]);
};
