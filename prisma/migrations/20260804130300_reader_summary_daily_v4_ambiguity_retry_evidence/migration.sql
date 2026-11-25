-- @social-monitor-forward-migration
-- Publication evidence must attest to the effective retry response, never the
-- terminal original FAILED_AMBIGUOUS row that it supersedes.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public."record_reader_summary_daily_canonical_recovery_v4_evidence"(
  target_publication_id UUID
) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog AS $function$
DECLARE
  v_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_existing public."reader_summary_weekly_publication_evidence"%ROWTYPE;
  v_job public."reader_summary_jobs"%ROWTYPE;
  v_lease public."reader_summary_daily_canonical_recovery_v4_effective_leases"%ROWTYPE;
  v_publication public."reader_summary_publications"%ROWTYPE;
  v_audit JSONB;
  v_body JSONB;
  v_bytes BYTEA;
  v_canonical TEXT;
  v_day DATE;
  v_github JSONB;
  v_github_mode TEXT;
  v_projection JSONB;
  v_provider JSONB;
  v_provider_counts JSONB;
  v_provider_sha TEXT;
  v_response JSONB;
  v_receipt JSONB;
  v_recovery JSONB;
  v_report JSONB;
  v_report_sha TEXT;
  v_proof_sha TEXT;
  v_scope JSONB;
  v_sha TEXT;
  v_source_locks INTEGER;
  v_feed_locks INTEGER;
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
  SELECT * INTO STRICT v_publication
  FROM public."reader_summary_publications" WHERE "id" = target_publication_id;
  SELECT * INTO STRICT v_job
  FROM public."reader_summary_jobs" WHERE "id" = v_publication."reader_summary_job_id";
  SELECT * INTO STRICT v_artifact
  FROM public."reader_summary_artifacts" WHERE "id" = v_publication."reader_summary_artifact_id";
  SELECT * INTO STRICT v_authority
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities"
  WHERE "tenant_id" = v_publication."tenant_id"
    AND "workspace_id" = v_publication."workspace_id"
    AND "requested_utc_date" = (v_publication."period_started_at" AT TIME ZONE 'UTC')::DATE
  FOR KEY SHARE;
  PERFORM public."lock_reader_summary_daily_canonical_recovery_v4_effective_attempt"(
    v_authority."tenant_id", v_authority."workspace_id", v_authority."requested_utc_date"
  );
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_effective_leases"
  WHERE "tenant_id" = v_authority."tenant_id"
    AND "workspace_id" = v_authority."workspace_id"
    AND "requested_utc_date" = v_authority."requested_utc_date";
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_ambiguity_retries" AS retry
    WHERE retry."tenant_id" = v_authority."tenant_id"
      AND retry."workspace_id" = v_authority."workspace_id"
      AND retry."requested_utc_date" = v_authority."requested_utc_date"
  ) THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_ambiguity_retry_binding"(
      v_authority."tenant_id", v_authority."workspace_id", v_authority."requested_utc_date"
    );
  END IF;
  SELECT * INTO v_existing
  FROM public."reader_summary_weekly_publication_evidence"
  WHERE "publication_id" = target_publication_id FOR UPDATE;
  v_day := (v_publication."period_started_at" AT TIME ZONE 'UTC')::DATE;
  v_audit := v_artifact."quality_signals"->'githubProjectionAudit';
  v_recovery := v_audit->'recoveryV4';
  v_projection := v_authority."source_authority_record"->'githubProjection';
  v_github_mode := v_projection->>'mode';
  IF v_publication."publication_kind" <> 'EXACT'
    OR v_publication."cadence" <> 'daily'
    OR v_publication."period_timezone" <> 'UTC'
    OR v_publication."period_ended_at" <> v_publication."period_started_at" + INTERVAL '1 day'
    OR v_publication."tenant_id" <> v_artifact."tenant_id"
    OR v_publication."workspace_id" <> v_artifact."workspace_id"
    OR v_publication."reader_summary_job_id" <> v_job."id"
    OR v_publication."reader_summary_artifact_id" <> v_artifact."id"
    OR v_job."reader_summary_artifact_id" <> v_artifact."id"
    OR v_job."status" <> v_publication."semantic_status"
    OR v_artifact."status" NOT IN (v_publication."semantic_status", 'SUPERSEDED')
    OR v_publication."requested_utc_date" <> v_day
    OR jsonb_typeof(v_recovery) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_recovery) <> 13
    OR NOT (v_recovery ?& ARRAY[
      'schemaVersion', 'recoveryVersion', 'selectedOutputKind',
      'sourceAuthoritySchemaVersion', 'tenantId', 'workspaceId',
      'requestedUtcDate', 'ingestionCutoff', 'sourceAuthoritySha256',
      'modelJobIdentity', 'outputTextSha256', 'outputTextByteLength',
      'githubProjectionSha256'
    ])
    OR v_recovery->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery_provenance.v2'
    OR v_recovery->>'recoveryVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery.v4'
    OR v_recovery->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_recovery->>'sourceAuthoritySchemaVersion' IS DISTINCT FROM '2'
    OR v_recovery->>'tenantId' IS DISTINCT FROM v_authority."tenant_id"::TEXT
    OR v_recovery->>'workspaceId' IS DISTINCT FROM v_authority."workspace_id"::TEXT
    OR v_recovery->>'requestedUtcDate' IS DISTINCT FROM to_char(v_day, 'YYYY-MM-DD')
    OR v_recovery->>'ingestionCutoff' IS DISTINCT FROM
      v_authority."source_authority_record"->>'ingestionCutoff'
    OR btrim(v_recovery->>'sourceAuthoritySha256') IS DISTINCT FROM
      btrim(v_authority."source_authority_sha256")
    OR btrim(v_recovery->>'modelJobIdentity') IS DISTINCT FROM
      btrim(v_lease."model_job_identity")
    OR btrim(v_recovery->>'outputTextSha256') !~ '^[0-9a-f]{64}$'
    OR COALESCE(v_recovery->>'outputTextByteLength', '') !~ '^[1-9][0-9]*$'
    OR btrim(v_recovery->>'githubProjectionSha256') IS DISTINCT FROM encode(
      sha256(convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_projection), 'UTF8')),
      'hex'
    )
    OR v_lease."response_bytes" IS NULL
    OR v_lease."receipt_bytes" IS NULL
    OR btrim(v_recovery->>'outputTextSha256') IS DISTINCT FROM
      encode(sha256(v_lease."response_bytes"), 'hex')
    OR (v_recovery->>'outputTextByteLength')::INTEGER IS DISTINCT FROM
      octet_length(v_lease."response_bytes")
    OR v_lease."state" NOT IN ('COMPLETED', 'PUBLICATION_PENDING', 'FINALIZED')
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication provenance is invalid';
  END IF;
  BEGIN
    v_response := convert_from(v_lease."response_bytes", 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication output_text is invalid';
  END;
  IF jsonb_typeof(v_response) IS DISTINCT FROM 'object'
    OR v_lease."response_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_response), 'UTF8'
    )
    OR public.jsonb_object_length(v_response) <> 12
    OR NOT (v_response ?& ARRAY[
      'headline', 'executiveSummary', 'narrativeSections', 'content', 'topStories',
      'interestHighlights', 'repeatedSignals', 'risksAndUnknowns', 'citationMap',
      'qualityFlags', 'confidence', 'noSignalReason'
    ])
    OR btrim(v_lease."response_sha256") IS DISTINCT FROM encode(
      sha256(v_lease."response_bytes"), 'hex'
    )
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication output_text binding diverged';
  END IF;
  IF v_artifact."headline" IS DISTINCT FROM v_response->>'headline'
    OR v_artifact."summary_text" IS DISTINCT FROM v_response->>'executiveSummary' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication artifact diverged from output_text: %',
      CASE
        WHEN v_artifact."headline" IS DISTINCT FROM v_response->>'headline' THEN 'headline'
        ELSE 'executiveSummary'
      END;
  END IF;
  BEGIN
    v_receipt := convert_from(v_lease."receipt_bytes", 'UTF8')::JSONB;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication receipt is invalid';
  END;
  IF jsonb_typeof(v_receipt) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_receipt) <> 8
    OR NOT (v_receipt ?& ARRAY[
      'schemaVersion', 'modelJobIdentity', 'requestedUtcDate', 'sourceAuthoritySha256',
      'responseSha256', 'responseByteLength', 'attestationSha256', 'attestation'
    ])
    OR v_receipt->>'schemaVersion' IS DISTINCT FROM '1'
    OR v_receipt->>'modelJobIdentity' IS DISTINCT FROM v_recovery->>'modelJobIdentity'
    OR v_receipt->>'requestedUtcDate' IS DISTINCT FROM v_recovery->>'requestedUtcDate'
    OR v_receipt->>'sourceAuthoritySha256' IS DISTINCT FROM v_recovery->>'sourceAuthoritySha256'
    OR v_receipt->>'responseSha256' IS DISTINCT FROM v_recovery->>'outputTextSha256'
    OR v_receipt->>'responseByteLength' IS DISTINCT FROM v_recovery->>'outputTextByteLength'
    OR v_lease."receipt_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json"(v_receipt), 'UTF8'
    )
    OR btrim(v_lease."receipt_sha256") IS DISTINCT FROM encode(
      sha256(v_lease."receipt_bytes"), 'hex'
    )
    OR v_receipt->>'attestationSha256' IS DISTINCT FROM
      btrim(v_lease."attestation_sha256")
    OR jsonb_typeof(v_receipt->'attestation') IS DISTINCT FROM 'object'
    OR v_receipt->'attestation' IS DISTINCT FROM v_lease."attestation"
    OR v_receipt->'attestation'->>'selectedOutputKind' IS DISTINCT FROM 'output_text'
    OR v_receipt->'attestation'->>'selectedOutputSha256' IS DISTINCT FROM
      v_recovery->>'outputTextSha256'
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication receipt binding diverged';
  END IF;
  IF jsonb_typeof(v_audit) IS DISTINCT FROM 'object'
    OR v_github_mode NOT IN ('checked_at_collection_anchor', 'historical_omission')
    OR (
      v_github_mode = 'checked_at_collection_anchor'
      AND (
        public.jsonb_object_length(v_audit) <> 11
        OR NOT (v_audit ?& ARRAY[
          'schemaVersion', 'status', 'requestedUtcDay', 'pageCount', 'scannedItemCount',
          'eligibleBindingIds', 'observedThrough', 'bindings', 'violationCodes',
          'reasons', 'recoveryV4'
        ])
        OR v_audit->>'schemaVersion' IS DISTINCT FROM 'reader_summary.github_projection.v1'
        OR v_audit->>'status' IS DISTINCT FROM 'verified'
        OR v_audit->>'requestedUtcDay' IS DISTINCT FROM to_char(v_day, 'YYYY-MM-DD')
        OR v_audit->>'pageCount' IS DISTINCT FROM v_projection->>'pageCount'
        OR v_audit->>'scannedItemCount' IS DISTINCT FROM
          jsonb_array_length(v_projection->'items')::TEXT
        OR v_audit->'eligibleBindingIds' IS DISTINCT FROM v_projection->'eligibleBindingIds'
        OR v_audit->>'observedThrough' IS DISTINCT FROM v_recovery->>'ingestionCutoff'
        OR v_audit->'bindings' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'violationCodes' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'reasons' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'recoveryV4' IS DISTINCT FROM v_recovery
      )
    ) OR (
      v_github_mode = 'historical_omission'
      AND (
        public.jsonb_object_length(v_audit) <> 11
        OR NOT (v_audit ?& ARRAY[
          'schemaVersion', 'status', 'requestedUtcDay', 'pageCount', 'scannedItemCount',
          'eligibleBindingIds', 'historicalOmission', 'bindings', 'violationCodes',
          'reasons', 'recoveryV4'
        ])
        OR v_audit->>'schemaVersion' IS DISTINCT FROM 'reader_summary.github_projection.v1'
        OR v_audit->>'status' IS DISTINCT FROM 'not_required'
        OR v_audit->>'requestedUtcDay' IS DISTINCT FROM to_char(v_day, 'YYYY-MM-DD')
        OR v_audit->>'pageCount' IS DISTINCT FROM '0'
        OR v_audit->>'scannedItemCount' IS DISTINCT FROM '0'
        OR v_audit->'eligibleBindingIds' IS DISTINCT FROM '[]'::JSONB
        OR jsonb_typeof(v_audit->'historicalOmission') IS DISTINCT FROM 'object'
        OR public.jsonb_object_length(v_audit->'historicalOmission') <> 3
        OR NOT (v_audit->'historicalOmission' ?& ARRAY[
          'mode', 'reason', 'authorizedAt'
        ])
        OR v_audit->'historicalOmission'->>'mode' IS DISTINCT FROM
          'github_projection_unavailable_historical'
        OR v_audit->'historicalOmission'->>'authorizedAt' IS DISTINCT FROM
          v_recovery->>'ingestionCutoff'
        OR v_audit->'historicalOmission'->>'reason' IS DISTINCT FROM v_projection->>'reason'
        OR v_audit->'bindings' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'violationCodes' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'reasons' IS DISTINCT FROM '[]'::JSONB
        OR v_audit->'recoveryV4' IS DISTINCT FROM v_recovery
      )
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 GitHub audit is invalid';
  END IF;
  IF jsonb_typeof(v_artifact."citations") IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_artifact."citations") AS citation(value)
    WHERE jsonb_typeof(citation.value) IS DISTINCT FROM 'object'
      OR NOT (citation.value ?& ARRAY[
        'citationId', 'field', 'feedItemId', 'sourceItemId', 'providerKey'
      ])
      OR citation.value->>'field' NOT IN ('title', 'bodyPreview', 'canonicalUrl')
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 citation graph is invalid';
  END IF;
  PERFORM source."id"
  FROM jsonb_array_elements(v_artifact."citations") AS citation(value)
  JOIN public."source_items" AS source
    ON source."id" = (citation.value->>'sourceItemId')::UUID
    AND source."tenant_id" = v_artifact."tenant_id"
    AND source."workspace_id" = v_artifact."workspace_id"
    AND source."provider_key" = citation.value->>'providerKey'
  JOIN public."feed_items" AS feed
    ON feed."id" = (citation.value->>'feedItemId')::UUID
    AND feed."source_item_id" = source."id"
    AND feed."tenant_id" = source."tenant_id"
    AND feed."workspace_id" = source."workspace_id"
    AND feed."canonical_url" = source."canonical_url"
  ORDER BY source."id" FOR UPDATE OF source, feed;
  GET DIAGNOSTICS v_source_locks = ROW_COUNT;
  IF v_source_locks <> jsonb_array_length(v_artifact."citations") THEN
    RAISE EXCEPTION 'daily canonical recovery v4 citation authority is incomplete';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'citationId', citation.value->>'citationId',
    'citationField', citation.value->>'field',
    'feedItemId', feed."id"::TEXT,
    'sourceItemId', source."id"::TEXT,
    'sourceBindingId', source."source_binding_id"::TEXT,
    'providerKey', source."provider_key",
    'providerItemId', source."provider_item_id",
    'canonicalUrl', feed."canonical_url",
    'title', feed."title",
    'sourceText', feed."body_preview",
    'publishedAt', to_char(feed."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'observedAt', to_char(feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'sourceContentHash', source."content_hash"
  ) ORDER BY source."provider_key", source."id"::TEXT, citation.value->>'citationId'),
    '[]'::JSONB)
  INTO v_provider
  FROM jsonb_array_elements(v_artifact."citations") AS citation(value)
  JOIN public."source_items" AS source
    ON source."id" = (citation.value->>'sourceItemId')::UUID
    AND source."tenant_id" = v_artifact."tenant_id"
    AND source."workspace_id" = v_artifact."workspace_id"
    AND source."provider_key" = citation.value->>'providerKey'
  JOIN public."feed_items" AS feed
    ON feed."id" = (citation.value->>'feedItemId')::UUID
    AND feed."source_item_id" = source."id"
    AND feed."tenant_id" = source."tenant_id"
    AND feed."workspace_id" = source."workspace_id"
    AND feed."canonical_url" = source."canonical_url";
  IF jsonb_array_length(v_provider) <> jsonb_array_length(v_artifact."citations")
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_provider) AS evidence(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_authority."source_authority_record"->'items') AS sealed(value)
        WHERE sealed.value->>'feedItemId' = evidence.value->>'feedItemId'
          AND sealed.value->>'sourceItemId' = evidence.value->>'sourceItemId'
          AND sealed.value->>'sourceBindingId' = evidence.value->>'sourceBindingId'
          AND sealed.value->>'providerKey' = evidence.value->>'providerKey'
          AND sealed.value->>'canonicalUrl' = evidence.value->>'canonicalUrl'
          AND sealed.value->>'title' = evidence.value->>'title'
          AND sealed.value->>'bodyPreview' = evidence.value->>'sourceText'
          AND sealed.value->>'publishedAt' = evidence.value->>'publishedAt'
          AND sealed.value->>'observedAt' = evidence.value->>'observedAt'
          AND sealed.value->>'contentHash' = evidence.value->>'sourceContentHash'
      )
    ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 provider evidence diverged from authority bytes';
  END IF;
  IF (v_publication."semantic_status" = 'COMPLETED' AND jsonb_array_length(v_provider) = 0)
    OR (v_publication."semantic_status" = 'NO_SIGNAL' AND jsonb_array_length(v_provider) <> 0) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 publication semantic status is invalid: status %, provider %, citations %, flags %',
      v_publication."semantic_status", jsonb_array_length(v_provider),
      jsonb_array_length(v_artifact."citations"), v_artifact."quality_signals"->'qualityFlags';
  END IF;
  v_provider_counts := (
    SELECT jsonb_agg(jsonb_build_object('providerKey', provider.key, 'count', (
      SELECT count(*) FROM jsonb_array_elements(v_provider) AS evidence
      WHERE evidence->>'providerKey' = provider.key
    )) ORDER BY provider.ordinality)
    FROM unnest(ARRAY['github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'])
      WITH ORDINALITY AS provider(key, ordinality)
  );
  v_provider_sha := encode(sha256(convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_provider), 'UTF8'
  )), 'hex');
  v_github := jsonb_build_object(
    'schemaVersion', 'reader_summary.weekly_publication_github_evidence.v1',
    'mode', CASE WHEN v_github_mode = 'historical_omission' THEN 'historical_unavailable'
      ELSE 'canonical_recovery_checked_at_collection_anchor' END,
    'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
    'providerKey', 'github-trending-page',
    'scanJobId', NULL,
    'sourceBindingId', NULL,
    'evidenceCount', CASE WHEN v_publication."semantic_status" = 'NO_SIGNAL' THEN 0
      WHEN v_github_mode = 'historical_omission' THEN 0 ELSE jsonb_array_length(v_projection->'items') END,
    'historicalUnavailableReason', CASE WHEN v_github_mode = 'historical_omission'
      THEN v_projection->>'reason' ELSE NULL END,
    'authorizedAt', CASE WHEN v_github_mode = 'historical_omission'
      THEN v_projection->>'authorizedAt' ELSE NULL END,
    'sourceProviderContentHash', NULL,
    'repositories', CASE WHEN v_publication."semantic_status" = 'NO_SIGNAL'
      THEN '[]'::JSONB ELSE COALESCE(v_projection->'items', '[]'::JSONB) END,
    'canonicalRecoveryV4', v_recovery
  );
  v_github := v_github || jsonb_build_object('sha256', encode(sha256(convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_github), 'UTF8'
  )), 'hex'));
  v_report := jsonb_build_object(
    'schemaVersion', 'reader_summary.publication_report.v1',
    'semanticStatus', v_publication."semantic_status"::TEXT,
    'modelVersion', v_artifact."model_version",
    'promptVersion', v_artifact."prompt_version",
    'headline', v_artifact."headline",
    'summaryText', v_artifact."summary_text",
    'artifactPayload', v_artifact."artifact_payload",
    'citations', v_artifact."citations",
    'qualitySignals', v_artifact."quality_signals" || jsonb_build_object(
      'publicationGeneration', jsonb_build_object('requestedAt', to_char(
        v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ))
    )
  );
  v_report_sha := encode(sha256(convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_report), 'UTF8'
  )), 'hex');
  v_proof_sha := encode(sha256(convert_to(
    public."reader_summary_weekly_canonical_json_unbounded"(v_publication."exact_proof"), 'UTF8'
  )), 'hex');
  IF btrim(v_publication."report_sha256") <> v_report_sha
    OR btrim(v_publication."proof_sha256") <> v_proof_sha THEN
    RAISE EXCEPTION 'daily canonical recovery v4 report or proof drifted';
  END IF;
  v_scope := CASE v_publication."scope_type"
    WHEN 'workspace' THEN jsonb_build_object('type', 'workspace')
    ELSE jsonb_build_object('type', 'interest', 'interestId', v_artifact."interest_id"::TEXT)
  END;
  v_body := jsonb_build_object(
    'schemaVersion', 'reader_summary.weekly_publication_evidence.v1',
    'tenantId', v_publication."tenant_id"::TEXT,
    'workspaceId', v_publication."workspace_id"::TEXT,
    'scope', v_scope,
    'period', jsonb_build_object(
      'cadence', 'daily',
      'startedAt', to_char(v_publication."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'endedAt', to_char(v_publication."period_ended_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'timezone', 'UTC', 'periodKey', v_publication."period_key"
    ),
    'requestedUtcDate', to_char(v_day, 'YYYY-MM-DD'),
    'publicationId', v_publication."id"::TEXT,
    'artifactId', v_artifact."id"::TEXT,
    'jobId', v_job."id"::TEXT,
    'reportId', 'reader-summary-report:' || v_publication."id"::TEXT,
    'proofId', 'reader-summary-proof:' || v_publication."id"::TEXT,
    'semanticStatus', v_publication."semantic_status"::TEXT,
    'reportSha256', v_report_sha,
    'proofSha256', v_proof_sha,
    'artifactPayloadSha256', encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_artifact."artifact_payload"), 'UTF8'
    )), 'hex'),
    'providerEvidenceSha256', v_provider_sha,
    'providerEvidence', v_provider,
    'providerCounts', v_provider_counts,
    'githubEvidence', v_github,
    'publishedAt', to_char(v_publication."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_canonical := public."reader_summary_weekly_canonical_json_unbounded"(v_body);
  v_bytes := convert_to(v_canonical, 'UTF8');
  v_sha := encode(sha256(v_bytes), 'hex');
  IF v_existing."publication_id" IS NOT NULL THEN
    IF v_existing."canonical_record" IS DISTINCT FROM v_body
      OR v_existing."canonical_bytes" IS DISTINCT FROM v_bytes
      OR btrim(v_existing."canonical_sha256") IS DISTINCT FROM v_sha THEN
      RAISE EXCEPTION 'daily canonical recovery v4 publication evidence replay diverged';
    END IF;
    RETURN;
  END IF;
  INSERT INTO public."reader_summary_weekly_publication_evidence" (
    "publication_id", "tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
    "period_started_at", "period_ended_at", "period_timezone", "requested_utc_date",
    "reader_summary_job_id", "reader_summary_artifact_id", "report_id", "proof_id",
    "semantic_status", "report", "report_sha256", "exact_proof", "proof_sha256",
    "artifact_payload_sha256", "provider_evidence", "provider_evidence_sha256",
    "github_evidence", "canonical_record", "canonical_bytes", "canonical_sha256",
    "identity", "recorded_at"
  ) VALUES (
    v_publication."id", v_publication."tenant_id", v_publication."workspace_id",
    v_publication."scope_type", v_publication."scope_key", v_publication."cadence",
    v_publication."period_started_at", v_publication."period_ended_at", v_publication."period_timezone",
    v_day, v_job."id", v_artifact."id", 'reader-summary-report:' || v_publication."id"::TEXT,
    'reader-summary-proof:' || v_publication."id"::TEXT, v_publication."semantic_status",
    v_report, v_report_sha, v_publication."exact_proof", v_proof_sha,
    v_body->>'artifactPayloadSha256', v_provider, v_provider_sha, v_github, v_body, v_bytes,
    v_sha, 'reader_summary.weekly_publication_evidence.v1:' || v_sha, v_publication."published_at"
  );
END;
$function$;

SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
