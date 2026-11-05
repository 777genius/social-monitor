// Cursor continuity includes terminal NO_SIGNAL publications. Keep this query
// separate from the COMPLETED-only multi-day successful-summary snapshot.
export const dailyGapPublicationBindingsQuery = `
  with requested_days as (
    select requested_date
    from unnest($4::date[]) as requested(requested_date)
  )
  select
    requested_days.requested_date::text as "collectionDate",
    transaction_timestamp() as "capturedAt",
    slot.current_publication_id::text as "currentPublicationId",
    publication.id::text as "publicationId",
    publication.publication_kind::text as "publicationKind",
    publication.semantic_status::text as "semanticStatus",
    publication.reader_summary_artifact_id::text as "publicationArtifactId",
    publication.model_version as "publicationModelVersion",
    publication.report_sha256::text as "reportSha256",
    publication.proof_sha256::text as "proofSha256",
    publication.exact_proof as "exactProof",
    publication.requested_utc_date::text as "publicationRequestedUtcDate",
    publication.requested_at as "publicationRequestedAt",
    publication.reader_summary_job_id::text as "publicationReaderSummaryJobId",
    artifact.id::text as "id",
    artifact.tenant_id::text as "tenantId",
    artifact.workspace_id::text as "workspaceId",
    artifact.scope_type as "scopeType",
    artifact.scope_key as "scopeKey",
    artifact.interest_id::text as "interestId",
    artifact.cadence as "cadence",
    artifact.period_started_at as "periodStartedAt",
    artifact.period_ended_at as "periodEndedAt",
    artifact.period_timezone as "periodTimezone",
    artifact.period_key as "periodKey",
    artifact.user_id::text as "userId",
    artifact.subscription_id::text as "subscriptionId",
    artifact.status::text as "status",
    artifact.schema_version as "schemaVersion",
    artifact.model_version as "modelVersion",
    artifact.prompt_version as "promptVersion",
    artifact.headline as "headline",
    artifact.summary_text as "summaryText",
    artifact.artifact_payload as "artifactPayload",
    artifact.citations as "citations",
    artifact.quality_signals as "qualitySignals",
    artifact.created_at as "createdAt",
    artifact.updated_at as "updatedAt"
  from requested_days
  join reader_summary_publication_slots slot
    on slot.tenant_id = $1::uuid
    and slot.workspace_id = $2::uuid
    and slot.scope_type = 'workspace'
    and slot.scope_key = $3
    and slot.cadence = 'daily'
    and slot.period_started_at = requested_days.requested_date::timestamp at time zone 'UTC'
    and slot.period_ended_at = (requested_days.requested_date + 1)::timestamp at time zone 'UTC'
    and slot.period_timezone = 'UTC'
    and slot.current_publication_id is not null
  join reader_summary_publications publication
    on publication.id = slot.current_publication_id
    and publication.tenant_id = slot.tenant_id
    and publication.workspace_id = slot.workspace_id
    and publication.scope_type = slot.scope_type
    and publication.scope_key = slot.scope_key
    and publication.cadence = slot.cadence
    and publication.period_started_at = slot.period_started_at
    and publication.period_ended_at = slot.period_ended_at
    and publication.period_timezone = slot.period_timezone
    and publication.publication_kind = 'EXACT'
    and publication.semantic_status in ('COMPLETED', 'NO_SIGNAL')
  join reader_summary_artifacts artifact
    on artifact.id = publication.reader_summary_artifact_id
    and artifact.tenant_id = publication.tenant_id
    and artifact.workspace_id = publication.workspace_id
    and artifact.scope_type = publication.scope_type
    and artifact.scope_key = publication.scope_key
    and artifact.cadence = publication.cadence
    and artifact.period_started_at = publication.period_started_at
    and artifact.period_ended_at = publication.period_ended_at
    and artifact.period_timezone = publication.period_timezone
    and artifact.period_key = publication.period_key
    and artifact.status = publication.semantic_status
    and artifact.model_version = publication.model_version
  order by requested_days.requested_date asc
`;
