import {
  type RecoveryPostgresClient,
  readerSummaryProductionRecoveryFixtureScope,
} from "./reader-summary-production-recovery-postgres-contract";

type EvidenceRecorderCandidate = Readonly<{ publicationId: string }>;

const assert: (condition: unknown, message: string) => asserts condition =
  (condition, message) => {
    if (!condition) throw new Error(message);
  };

export const assertReaderSummaryDailyCanonicalRecoveryV4EvidenceRecorderPostgresContract = async (
  client: Pick<RecoveryPostgresClient, "query">,
): Promise<void> => {
  const { tenantId, workspaceId } = readerSummaryProductionRecoveryFixtureScope;
  const v3 = await client.query<{ rows: string }>(`
    SELECT count(*)::TEXT AS rows
    FROM public."reader_summary_weekly_publication_evidence" evidence
    JOIN public."reader_summary_artifacts" artifact
      ON artifact.id = evidence.reader_summary_artifact_id
    WHERE evidence.tenant_id = $1::UUID AND evidence.workspace_id = $2::UUID
      AND artifact.quality_signals->'githubProjectionAudit'->'recoveryV4'
        ->>'schemaVersion' = 'reader_summary.daily_canonical_recovery_provenance.v3'
  `, [tenantId, workspaceId]);
  assert(v3.rows[0]?.rows === "8", "V3 evidence recorder did not persist all recovery evidence");
  await client.query("BEGIN");
  try {
    const selected = await client.query<EvidenceRecorderCandidate>(`
      SELECT publication_id::TEXT AS "publicationId"
      FROM public."reader_summary_daily_canonical_recovery_v4_leases"
      WHERE tenant_id = $1::UUID AND workspace_id = $2::UUID
        AND requested_utc_date = DATE '2026-07-24' AND state = 'FINALIZED'
    `, [tenantId, workspaceId]);
    const publicationId = selected.rows[0]?.publicationId;
    assert(selected.rows.length === 1 && publicationId !== undefined, "V2 recorder fixture publication is missing");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(`
      WITH source AS (
        SELECT lease.*, jsonb_set(lease.attestation, '{selectedOutputSha256}',
          to_jsonb(btrim(lease.response_sha256)), false) AS v2_attestation
        FROM public."reader_summary_daily_canonical_recovery_v4_leases" lease
        WHERE lease.publication_id = $1::UUID
      ), attested AS (
        SELECT source.*, convert_to(public."reader_summary_weekly_canonical_json"(v2_attestation), 'UTF8') AS v2_attestation_bytes
        FROM source
      ), receipted AS (
        SELECT attested.*, jsonb_build_object('schemaVersion',1,'modelJobIdentity',btrim(model_job_identity),
          'requestedUtcDate',to_char(requested_utc_date,'YYYY-MM-DD'),'sourceAuthoritySha256',btrim(source_authority_sha256),
          'responseSha256',btrim(response_sha256),'responseByteLength',octet_length(response_bytes),
          'attestationSha256',encode(sha256(v2_attestation_bytes),'hex'),'attestation',v2_attestation) AS v2_receipt
        FROM attested
      )
      UPDATE public."reader_summary_daily_canonical_recovery_v4_leases" lease
      SET attestation = source.v2_attestation, attestation_bytes = source.v2_attestation_bytes,
        attestation_sha256 = encode(sha256(source.v2_attestation_bytes),'hex'),
        receipt_bytes = convert_to(public."reader_summary_weekly_canonical_json"(source.v2_receipt),'UTF8'),
        receipt_sha256 = encode(sha256(convert_to(public."reader_summary_weekly_canonical_json"(source.v2_receipt),'UTF8')),'hex')
      FROM receipted source
      WHERE lease.tenant_id = source.tenant_id AND lease.workspace_id = source.workspace_id
        AND lease.requested_utc_date = source.requested_utc_date
    `, [publicationId]);
    await client.query(`
      WITH source AS (
        SELECT artifact.id, artifact.quality_signals->'githubProjectionAudit'->'recoveryV4' AS recovery
        FROM public."reader_summary_artifacts" artifact
        WHERE artifact.id = (SELECT reader_summary_artifact_id FROM public."reader_summary_publications" WHERE id = $1::UUID)
      )
      UPDATE public."reader_summary_artifacts" artifact
      SET quality_signals = jsonb_set(artifact.quality_signals, '{githubProjectionAudit,recoveryV4}',
        jsonb_build_object('schemaVersion','reader_summary.daily_canonical_recovery_provenance.v2',
          'recoveryVersion',recovery->>'recoveryVersion','selectedOutputKind','output_text',
          'sourceAuthoritySchemaVersion',2,'tenantId',recovery->>'tenantId','workspaceId',recovery->>'workspaceId',
          'requestedUtcDate',recovery->>'requestedUtcDate','ingestionCutoff',recovery->>'ingestionCutoff',
          'sourceAuthoritySha256',recovery->>'sourceAuthoritySha256','modelJobIdentity',recovery->>'modelJobIdentity',
          'outputTextSha256',recovery->>'canonicalOutputSha256',
          'outputTextByteLength',(recovery->>'canonicalOutputByteLength')::INTEGER,
          'githubProjectionSha256',recovery->>'githubProjectionSha256'), false)
      FROM source
      WHERE artifact.id = source.id
    `, [publicationId]);
    await client.query(`
      UPDATE public."reader_summary_publications" publication
      SET report_sha256 = encode(sha256(convert_to(public."reader_summary_weekly_canonical_json_unbounded"(
        jsonb_build_object('schemaVersion','reader_summary.publication_report.v1','semanticStatus',publication.semantic_status::TEXT,
          'modelVersion',artifact.model_version,'promptVersion',artifact.prompt_version,'headline',artifact.headline,
          'summaryText',artifact.summary_text,'artifactPayload',artifact.artifact_payload,'citations',artifact.citations,
          'qualitySignals',artifact.quality_signals || jsonb_build_object('publicationGeneration',jsonb_build_object(
            'requestedAt',to_char(job.requested_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))))), 'UTF8')), 'hex')
      FROM public."reader_summary_artifacts" artifact, public."reader_summary_jobs" job
      WHERE publication.id = $1::UUID AND artifact.id = publication.reader_summary_artifact_id
        AND job.id = publication.reader_summary_job_id
    `, [publicationId]);
    await client.query('DELETE FROM public."reader_summary_weekly_publication_evidence" WHERE publication_id = $1::UUID', [publicationId]);
    await client.query("SET LOCAL session_replication_role = origin");
    await client.query('SET LOCAL ROLE "social_monitor_reader_summary_publication_owner"');
    await client.query('SELECT public."record_reader_summary_daily_canonical_recovery_v4_evidence"($1::UUID)', [publicationId]);
    await client.query("RESET ROLE");
    const v2 = await client.query<{ schema: string; evidenceSchema: string; rows: string }>(`
      SELECT artifact.quality_signals->'githubProjectionAudit'->'recoveryV4'->>'schemaVersion' AS schema,
        evidence.canonical_record->'githubEvidence'->'canonicalRecoveryV4'->>'schemaVersion' AS "evidenceSchema",
        count(*) OVER ()::TEXT AS rows
      FROM public."reader_summary_weekly_publication_evidence" evidence
      JOIN public."reader_summary_artifacts" artifact ON artifact.id = evidence.reader_summary_artifact_id
      WHERE evidence.publication_id = $1::UUID
    `, [publicationId]);
    assert(v2.rows.length === 1 && v2.rows[0]?.rows === "1" &&
      v2.rows[0]?.schema === "reader_summary.daily_canonical_recovery_provenance.v2" &&
      v2.rows[0]?.evidenceSchema === "reader_summary.daily_canonical_recovery_provenance.v2",
    "V2 evidence recorder did not persist V2-bound publication evidence");
  } finally {
    await client.query("ROLLBACK");
  }
};
