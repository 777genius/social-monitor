-- @social-monitor-forward-migration
-- V4 adopts immutable Jul23-Jul30 evidence only. It does not recollect,
-- backdate, mutate the ordinary daily cursor, or admit an additional date.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_plans" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "ordinal" SMALLINT NOT NULL,
  "canonical_record" JSONB NOT NULL,
  "canonical_bytes" BYTEA NOT NULL,
  "canonical_sha256" CHAR(64) NOT NULL,
  "adopted_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_plans_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "ordinal"),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_plans_ordinal_check"
    CHECK ("ordinal" IN (1, 2)),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_plans_sha_check"
    CHECK ("canonical_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_plans_record_check"
    CHECK (jsonb_typeof("canonical_record") = 'object')
);

CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_authorities" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "legacy_recovery_id" UUID NOT NULL,
  "legacy_day_canonical_sha256" CHAR(64) NOT NULL,
  "source_authority_record" JSONB NOT NULL,
  "source_authority_bytes" BYTEA NOT NULL,
  "source_authority_sha256" CHAR(64) NOT NULL,
  "adopted_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_authorities_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "requested_utc_date"),
  CONSTRAINT "rs_daily_recovery_v4_authorities_date_check" CHECK (
    "requested_utc_date" IN (
      DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
      DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
      DATE '2026-07-29', DATE '2026-07-30'
    )
  ),
  CONSTRAINT "rs_daily_recovery_v4_authorities_sha_check" CHECK (
    "legacy_day_canonical_sha256" ~ '^[0-9a-f]{64}$'
    AND "source_authority_sha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "rs_daily_recovery_v4_authorities_record_check"
    CHECK (jsonb_typeof("source_authority_record") = 'object')
);

CREATE TABLE public."reader_summary_daily_canonical_recovery_v4_leases" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "requested_utc_date" DATE NOT NULL,
  "source_authority_sha256" CHAR(64) NOT NULL,
  "model_job_identity" CHAR(64) NOT NULL,
  "state" TEXT NOT NULL,
  "pre_model_consumed_at" TIMESTAMPTZ(6),
  "lease_owner" TEXT,
  "fencing_token" BIGINT NOT NULL DEFAULT 0,
  "leased_at" TIMESTAMPTZ(6),
  "lease_expires_at" TIMESTAMPTZ(6),
  "absolute_expires_at" TIMESTAMPTZ(6),
  "running_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "failed_ambiguous_at" TIMESTAMPTZ(6),
  "response_bytes" BYTEA,
  "response_sha256" CHAR(64),
  "attestation" JSONB,
  "attestation_bytes" BYTEA,
  "attestation_sha256" CHAR(64),
  "receipt_bytes" BYTEA,
  "receipt_sha256" CHAR(64),
  "reader_summary_job_id" UUID,
  "reader_summary_artifact_id" UUID,
  "publication_id" UUID,
  "publication_report_sha256" CHAR(64),
  "publication_proof_sha256" CHAR(64),
  "weekly_evidence_sha256" CHAR(64),
  "public_evidence_sha256" CHAR(64),
  "public_frontend_sha256" CHAR(64),
  "publication_prepared_at" TIMESTAMPTZ(6),
  "finalized_at" TIMESTAMPTZ(6),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_leases_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "requested_utc_date"),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_leases_identity_key"
    UNIQUE ("model_job_identity"),
  CONSTRAINT "rs_daily_recovery_v4_leases_authority_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "requested_utc_date")
    REFERENCES public."reader_summary_daily_canonical_recovery_v4_authorities"
      ("tenant_id", "workspace_id", "requested_utc_date")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_leases_state_check"
    CHECK ("state" IN (
      'READY', 'CONSUMED', 'RUNNING', 'COMPLETED', 'PUBLICATION_PENDING',
      'FINALIZED', 'FAILED_AMBIGUOUS'
    )),
  CONSTRAINT "reader_summary_daily_canonical_recovery_v4_leases_sha_check" CHECK (
    "source_authority_sha256" ~ '^[0-9a-f]{64}$'
    AND "model_job_identity" ~ '^[0-9a-f]{64}$'
    AND ("response_sha256" IS NULL OR "response_sha256" ~ '^[0-9a-f]{64}$')
    AND ("attestation_sha256" IS NULL OR "attestation_sha256" ~ '^[0-9a-f]{64}$')
    AND ("receipt_sha256" IS NULL OR "receipt_sha256" ~ '^[0-9a-f]{64}$')
    AND ("publication_report_sha256" IS NULL OR "publication_report_sha256" ~ '^[0-9a-f]{64}$')
    AND ("publication_proof_sha256" IS NULL OR "publication_proof_sha256" ~ '^[0-9a-f]{64}$')
    AND ("weekly_evidence_sha256" IS NULL OR "weekly_evidence_sha256" ~ '^[0-9a-f]{64}$')
    AND ("public_evidence_sha256" IS NULL OR "public_evidence_sha256" ~ '^[0-9a-f]{64}$')
    AND ("public_frontend_sha256" IS NULL OR "public_frontend_sha256" ~ '^[0-9a-f]{64}$')
  ),
  CONSTRAINT "rs_daily_recovery_v4_leases_consumed_check" CHECK (
    ("state" = 'READY' AND "pre_model_consumed_at" IS NULL)
    OR ("state" <> 'READY' AND "pre_model_consumed_at" IS NOT NULL)
  ),
  CONSTRAINT "rs_daily_recovery_v4_leases_chronology_check" CHECK (
    ("running_at" IS NULL OR "running_at" >= "pre_model_consumed_at")
    AND ("completed_at" IS NULL OR (
      "running_at" IS NOT NULL AND "completed_at" >= "running_at"
    ))
    AND ("failed_ambiguous_at" IS NULL OR "failed_ambiguous_at" >= "pre_model_consumed_at")
    AND ("finalized_at" IS NULL OR (
      "completed_at" IS NOT NULL AND "finalized_at" >= "completed_at"
    ))
    AND ("state" <> 'RUNNING' OR "running_at" IS NOT NULL)
    AND ("state" NOT IN ('COMPLETED', 'PUBLICATION_PENDING', 'FINALIZED') OR (
      "running_at" IS NOT NULL AND "completed_at" IS NOT NULL
      AND "response_bytes" IS NOT NULL AND "receipt_bytes" IS NOT NULL
    ))
    AND ("publication_prepared_at" IS NULL OR (
      "completed_at" IS NOT NULL AND "publication_prepared_at" >= "completed_at"
    ))
    AND ("state" NOT IN ('PUBLICATION_PENDING', 'FINALIZED') OR (
      "publication_prepared_at" IS NOT NULL
      AND "reader_summary_job_id" IS NOT NULL
      AND "reader_summary_artifact_id" IS NOT NULL
      AND "publication_id" IS NOT NULL
      AND "public_evidence_sha256" IS NOT NULL
      AND "public_frontend_sha256" IS NOT NULL
    ))
    AND ("state" <> 'FINALIZED' OR "finalized_at" IS NOT NULL)
  )
);

CREATE INDEX "reader_summary_daily_canonical_recovery_v4_leases_state_idx"
  ON public."reader_summary_daily_canonical_recovery_v4_leases"
    ("tenant_id", "workspace_id", "state", "requested_utc_date");

ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_plans"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_plans"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_authorities"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_authorities"
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_leases"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reader_summary_daily_canonical_recovery_v4_leases"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "reader_summary_daily_canonical_recovery_v4_plans_owner_only"
  ON public."reader_summary_daily_canonical_recovery_v4_plans"
  FOR ALL TO "social_monitor_reader_summary_publication_owner"
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "rs_daily_recovery_v4_authorities_owner_only"
  ON public."reader_summary_daily_canonical_recovery_v4_authorities"
  FOR ALL TO "social_monitor_reader_summary_publication_owner"
  USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "reader_summary_daily_canonical_recovery_v4_leases_owner_only"
  ON public."reader_summary_daily_canonical_recovery_v4_leases"
  FOR ALL TO "social_monitor_reader_summary_publication_owner"
  USING (TRUE) WITH CHECK (TRUE);

CREATE FUNCTION public."reject_reader_summary_daily_canonical_recovery_v4_plan_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'daily canonical recovery v4 plans are immutable';
END;
$function$;

CREATE FUNCTION public."reject_rs_daily_recovery_v4_authority_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION 'daily canonical recovery v4 authorities are immutable';
END;
$function$;

CREATE TRIGGER "reader_summary_daily_canonical_recovery_v4_plans_immutable"
BEFORE UPDATE OR DELETE ON public."reader_summary_daily_canonical_recovery_v4_plans"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_reader_summary_daily_canonical_recovery_v4_plan_mutation"();
CREATE TRIGGER "rs_daily_recovery_v4_authorities_immutable"
BEFORE UPDATE OR DELETE ON public."reader_summary_daily_canonical_recovery_v4_authorities"
FOR EACH ROW EXECUTE FUNCTION
  public."reject_rs_daily_recovery_v4_authority_mutation"();

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_model_identity"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  source_authority_sha256 TEXT
) RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
  SELECT encode(sha256(convert_to(concat_ws('|',
    'reader-summary-daily:v1', target_tenant_id::TEXT,
    target_workspace_id::TEXT, to_char(target_date, 'YYYY-MM-DD'),
    source_authority_sha256, 'codex', 'gpt-5.6-sol', 'xhigh', 'output_text'
  ), 'UTF8')), 'hex')
$function$;

CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_legacy"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  c_v2_dates CONSTANT JSONB :=
    '["2026-07-23","2026-07-24","2026-07-25","2026-07-26","2026-07-27","2026-07-28"]'::JSONB;
  -- The immutable legacy V3 authority also recorded Jul31; v4 reads only 29-30.
  c_v3_dates CONSTANT JSONB :=
    '["2026-07-29","2026-07-30","2026-07-31"]'::JSONB;
  v_count INTEGER;
  v_expected_dates JSONB;
  v_expected_day_schema TEXT;
  v_provider_digests JSONB;
  v_provider_evidence_sha TEXT;
  v_lease public."reader_summary_production_recovery_leases"%ROWTYPE;
  v_day public."reader_summary_production_recovery_days"%ROWTYPE;
BEGIN
  PERFORM lease."id"
  FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND (
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
       AND lease."canonical_record"->'requestedUtcDates' = c_v2_dates)
      OR
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_gap_authority.v3'
       AND lease."canonical_record"->'requestedUtcDates' = c_v3_dates)
    )
  ORDER BY lease."id" FOR KEY SHARE;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND (
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
       AND lease."canonical_record"->'requestedUtcDates' = c_v2_dates)
      OR
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_gap_authority.v3'
       AND lease."canonical_record"->'requestedUtcDates' = c_v3_dates)
    );
  IF v_count <> 2 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires exactly two immutable legacy authorities';
  END IF;

  FOR v_lease IN
    SELECT lease.*
    FROM public."reader_summary_production_recovery_leases" AS lease
    WHERE lease."tenant_id" = c_tenant_id
      AND lease."workspace_id" = c_workspace_id
      AND (
        (lease."canonical_record"->>'schemaVersion' =
          'reader_summary.production_recovery_authority.v2'
         AND lease."canonical_record"->'requestedUtcDates' = c_v2_dates)
        OR
        (lease."canonical_record"->>'schemaVersion' =
          'reader_summary.production_recovery_gap_authority.v3'
         AND lease."canonical_record"->'requestedUtcDates' = c_v3_dates)
      )
    ORDER BY lease."id"
  LOOP
    v_expected_dates := CASE v_lease."canonical_record"->>'schemaVersion'
      WHEN 'reader_summary.production_recovery_authority.v2' THEN c_v2_dates
      ELSE c_v3_dates
    END;
    v_expected_day_schema := CASE v_lease."canonical_record"->>'schemaVersion'
      WHEN 'reader_summary.production_recovery_authority.v2'
        THEN 'reader_summary.production_recovery_day.v2'
      ELSE 'reader_summary.production_recovery_gap_day.v3'
    END;
    IF v_lease."state" <> 'CONSUMED'
      OR v_lease."consumed_at" IS DISTINCT FROM v_lease."issued_at"
      OR v_lease."canonical_bytes" IS DISTINCT FROM convert_to(
        CASE v_lease."canonical_record"->>'schemaVersion'
          WHEN 'reader_summary.production_recovery_authority.v2' THEN
            public."reader_summary_weekly_canonical_json"(v_lease."canonical_record")
          ELSE public."reader_summary_production_recovery_canonical_json"(
            v_lease."canonical_record"
          )
        END,
        'UTF8'
      )
      OR btrim(v_lease."canonical_sha256") IS DISTINCT FROM
        encode(sha256(v_lease."canonical_bytes"), 'hex')
      OR v_lease."canonical_record"->>'tenantId' IS DISTINCT FROM c_tenant_id::TEXT
      OR v_lease."canonical_record"->>'workspaceId' IS DISTINCT FROM c_workspace_id::TEXT
      OR v_lease."canonical_record"->'requestedUtcDates' IS DISTINCT FROM v_expected_dates
      OR v_lease."canonical_record"->'boundaries'->>'stage' IS DISTINCT FROM 'pre_model'
      OR (v_lease."canonical_record"->'boundaries'->>'modelCallPerformed')::BOOLEAN IS NOT FALSE
      OR (v_lease."canonical_record"->'boundaries'->>'publicationPerformed')::BOOLEAN IS NOT FALSE
      OR (v_lease."canonical_record"->'boundaries'->>'recollectionPerformed')::BOOLEAN IS NOT FALSE
    THEN
      RAISE EXCEPTION 'daily canonical recovery v4 legacy lease is not immutable pre-model evidence';
    END IF;

    PERFORM dry."ordinal"
    FROM public."reader_summary_production_recovery_dry_runs" AS dry
    WHERE dry."recovery_id" = v_lease."id"
      AND dry."tenant_id" = c_tenant_id
      AND dry."workspace_id" = c_workspace_id
    ORDER BY dry."ordinal" FOR KEY SHARE;
    SELECT count(*)::INTEGER INTO v_count
    FROM public."reader_summary_production_recovery_dry_runs" AS dry
    WHERE dry."recovery_id" = v_lease."id"
      AND dry."tenant_id" = c_tenant_id
      AND dry."workspace_id" = c_workspace_id
      AND dry."ordinal" IN (1, 2)
      AND dry."canonical_record" = v_lease."canonical_record"
      AND dry."canonical_bytes" = v_lease."canonical_bytes"
      AND btrim(dry."canonical_sha256") = btrim(v_lease."canonical_sha256")
      AND dry."captured_at" = v_lease."issued_at";
    IF v_count <> 2 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 requires two identical immutable legacy plans';
    END IF;

    PERFORM day."requested_utc_date"
    FROM public."reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = v_lease."id"
      AND day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
    ORDER BY day."requested_utc_date" FOR KEY SHARE;
    SELECT count(*)::INTEGER INTO v_count
    FROM public."reader_summary_production_recovery_days" AS day
    WHERE day."recovery_id" = v_lease."id"
      AND day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id;
    IF v_count <> jsonb_array_length(v_expected_dates)
      OR (
        SELECT jsonb_agg(to_char(day."requested_utc_date", 'YYYY-MM-DD')
          ORDER BY day."requested_utc_date")
        FROM public."reader_summary_production_recovery_days" AS day
        WHERE day."recovery_id" = v_lease."id"
          AND day."tenant_id" = c_tenant_id
          AND day."workspace_id" = c_workspace_id
      ) IS DISTINCT FROM v_expected_dates THEN
      RAISE EXCEPTION 'daily canonical recovery v4 legacy date set diverged';
    END IF;

    FOR v_day IN
      SELECT day.*
      FROM public."reader_summary_production_recovery_days" AS day
      WHERE day."recovery_id" = v_lease."id"
        AND day."tenant_id" = c_tenant_id
        AND day."workspace_id" = c_workspace_id
      ORDER BY day."requested_utc_date"
    LOOP
      v_provider_digests := CASE v_expected_day_schema
        WHEN 'reader_summary.production_recovery_day.v2' THEN (
          SELECT jsonb_agg(jsonb_build_object(
            'providerKey', provider.provider_key,
            'count', jsonb_array_length(
              v_day."provider_evidence"->provider.provider_key
            ),
            'sha256', encode(sha256(convert_to(
              public."reader_summary_production_recovery_canonical_json"(
                v_day."provider_evidence"->provider.provider_key
              ),
              'UTF8'
            )), 'hex')
          ) ORDER BY provider.ordinal)
          FROM unnest(ARRAY[
            'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
          ]) WITH ORDINALITY AS provider(provider_key, ordinal)
        )
        ELSE (
          SELECT jsonb_agg(jsonb_build_object(
            'providerKey', coverage.value->>'providerKey',
            'count', (coverage.value->>'count')::INTEGER,
            'sha256', encode(sha256(convert_to(
              public."reader_summary_production_recovery_canonical_json"(
                v_day."provider_evidence"->(coverage.value->>'providerKey')
              ),
              'UTF8'
            )), 'hex')
          ) ORDER BY coverage.ordinal)
          FROM jsonb_array_elements(
            v_day."canonical_record"->'providerCoverage'
          ) WITH ORDINALITY AS coverage(value, ordinal)
        )
      END;
      v_provider_evidence_sha := encode(sha256(convert_to(
        public."reader_summary_production_recovery_canonical_json"(
          v_provider_digests
        ),
        'UTF8'
      )), 'hex');
      IF v_day."canonical_record"->>'schemaVersion' IS DISTINCT FROM v_expected_day_schema
        OR v_day."canonical_record"->>'requestedUtcDate' IS DISTINCT FROM
          to_char(v_day."requested_utc_date", 'YYYY-MM-DD')
        OR v_day."canonical_record"->'providerEvidenceSha256' IS DISTINCT FROM
          to_jsonb(btrim(v_day."provider_evidence_sha256"))
        OR btrim(v_day."provider_evidence_sha256") IS DISTINCT FROM
          v_provider_evidence_sha
        OR (v_expected_day_schema = 'reader_summary.production_recovery_day.v2'
          AND (
            v_day."canonical_record"->'providerCounts' IS DISTINCT FROM
              v_day."provider_counts"
            OR v_day."canonical_record"->'providerEvidenceDigests' IS DISTINCT FROM
              v_provider_digests
          ))
        OR (v_expected_day_schema = 'reader_summary.production_recovery_gap_day.v3'
          AND (
            v_day."canonical_record"->'providerCoverage' IS DISTINCT FROM
              v_day."provider_counts"
            OR EXISTS (
              SELECT 1
              FROM jsonb_array_elements(
                v_day."canonical_record"->'providerCoverage'
              ) WITH ORDINALITY AS coverage(value, ordinal)
              WHERE coverage.value->>'evidenceSha256' IS DISTINCT FROM
                v_provider_digests->((coverage.ordinal - 1)::INTEGER)->>'sha256'
            )
          ))
        OR v_day."canonical_bytes" IS DISTINCT FROM convert_to(
          CASE v_expected_day_schema
            WHEN 'reader_summary.production_recovery_day.v2' THEN
              public."reader_summary_weekly_canonical_json"(v_day."canonical_record")
            ELSE public."reader_summary_production_recovery_canonical_json"(
              v_day."canonical_record"
            )
          END,
          'UTF8'
        )
        OR btrim(v_day."canonical_sha256") IS DISTINCT FROM
          encode(sha256(v_day."canonical_bytes"), 'hex')
      THEN
        RAISE EXCEPTION 'daily canonical recovery v4 legacy day evidence diverged';
      END IF;
    END LOOP;
  END LOOP;

  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_production_recovery_days" AS day
  JOIN public."reader_summary_production_recovery_leases" AS lease
    ON lease."id" = day."recovery_id"
  WHERE day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
    AND day."requested_utc_date" = DATE '2026-07-23'
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires one immutable Jul23 authority';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = DATE '2026-07-23'
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
      AND (
        day."github_evidence"->>'mode' IS DISTINCT FROM 'historical_unavailable'
        OR day."github_evidence"->>'evidenceCount' IS DISTINCT FROM '0'
        OR jsonb_array_length(day."provider_evidence"->'github-trending-page') <> 0
        OR jsonb_array_length(day."provider_evidence"->'hacker-news') <> 100
        OR jsonb_array_length(day."provider_evidence"->'reddit') <> 100
        OR jsonb_array_length(day."provider_evidence"->'rss') <> 75
        OR jsonb_array_length(day."provider_evidence"->'x-twitter') <> 67
        OR (SELECT sum(jsonb_array_length(provider.value))
          FROM jsonb_each(day."provider_evidence") AS provider(key, value)) <> 342
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires exact Jul23 immutable evidence counts';
  END IF;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_production_recovery_days" AS day
  JOIN public."reader_summary_production_recovery_leases" AS lease
    ON lease."id" = day."recovery_id"
  WHERE day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
    AND day."requested_utc_date" = DATE '2026-07-24'
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires one immutable Jul24 authority';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = DATE '2026-07-24'
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
      AND (
        day."github_evidence"->>'mode' IS DISTINCT FROM 'verified_existing'
        OR day."github_evidence"->>'evidenceCount' IS DISTINCT FROM '10'
        OR jsonb_array_length(day."provider_evidence"->'github-trending-page') <> 10
        OR jsonb_array_length(day."provider_evidence"->'hacker-news') <> 100
        OR jsonb_array_length(day."provider_evidence"->'reddit') <> 100
        OR jsonb_array_length(day."provider_evidence"->'rss') <> 67
        OR jsonb_array_length(day."provider_evidence"->'x-twitter') <> 73
        OR (SELECT sum(jsonb_array_length(provider.value))
          FROM jsonb_each(day."provider_evidence") AS provider(key, value)) <> 350
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires exact Jul24 immutable evidence counts';
  END IF;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_production_recovery_days" AS day
  JOIN public."reader_summary_production_recovery_leases" AS lease
    ON lease."id" = day."recovery_id"
  WHERE day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
    AND day."requested_utc_date" = DATE '2026-07-28'
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_authority.v2';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires one immutable Jul28 authority';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = DATE '2026-07-28'
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
      AND (
        day."github_evidence"->>'mode' IS DISTINCT FROM 'historical_unavailable'
        OR day."github_evidence"->>'evidenceCount' IS DISTINCT FROM '0'
        OR jsonb_array_length(day."provider_evidence"->'github-trending-page') <> 0
        OR jsonb_array_length(day."provider_evidence"->'hacker-news') <> 0
        OR jsonb_array_length(day."provider_evidence"->'reddit') <> 0
        OR jsonb_array_length(day."provider_evidence"->'rss') <> 31
        OR jsonb_array_length(day."provider_evidence"->'x-twitter') <> 107
        OR (SELECT sum(jsonb_array_length(provider.value))
          FROM jsonb_each(day."provider_evidence") AS provider(key, value)) <> 138
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires exact Jul28 immutable evidence counts';
  END IF;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_production_recovery_days" AS day
  JOIN public."reader_summary_production_recovery_leases" AS lease
    ON lease."id" = day."recovery_id"
  WHERE day."tenant_id" = c_tenant_id
    AND day."workspace_id" = c_workspace_id
    AND day."requested_utc_date" = DATE '2026-07-30'
    AND lease."canonical_record"->>'schemaVersion' =
      'reader_summary.production_recovery_gap_authority.v3';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires one immutable Jul30 authority';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = DATE '2026-07-30'
      AND lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_gap_authority.v3'
      AND (
        day."github_evidence"->>'mode' IS DISTINCT FROM 'missing'
        OR day."github_evidence"->>'evidenceCount' IS DISTINCT FROM '0'
        OR jsonb_array_length(day."provider_evidence"->'github-trending-page') <> 0
        OR jsonb_array_length(day."provider_evidence"->'hacker-news') <> 0
        OR jsonb_array_length(day."provider_evidence"->'reddit') <> 0
        OR jsonb_array_length(day."provider_evidence"->'rss') <> 34
        OR jsonb_array_length(day."provider_evidence"->'x-twitter') <> 64
        OR (SELECT sum(jsonb_array_length(provider.value))
          FROM jsonb_each(day."provider_evidence") AS provider(key, value)) <> 98
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 requires exact Jul30 immutable evidence counts';
  END IF;
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_source_authority"(
  target_tenant_id UUID,
  target_workspace_id UUID,
  target_date DATE,
  target_cutoff TIMESTAMPTZ,
  legacy_evidence JSONB,
  legacy_github_evidence JSONB
) RETURNS JSONB LANGUAGE plpgsql IMMUTABLE STRICT SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  v_cutoff TEXT;
  v_items JSONB;
  v_github_items JSONB := '[]'::JSONB;
  v_eligible_binding_ids JSONB := '[]'::JSONB;
  v_github_projection JSONB;
  v_github_mode TEXT;
  v_github_count INTEGER;
  v_page_count INTEGER;
  c_historical_omission_reason CONSTANT TEXT :=
    'Reviewed immutable recovery authority contains no eligible GitHub trending projection for this UTC day.';
BEGIN
  IF target_date NOT IN (
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
    DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
    DATE '2026-07-29', DATE '2026-07-30'
  )
    OR jsonb_typeof(legacy_evidence) IS DISTINCT FROM 'object'
    OR (SELECT count(*) FROM jsonb_object_keys(legacy_evidence)) <> 5
    OR (
      SELECT jsonb_agg(key ORDER BY key)
      FROM jsonb_object_keys(legacy_evidence) AS entry(key)
    ) IS DISTINCT FROM
      '["github-trending-page","hacker-news","reddit","rss","x-twitter"]'::JSONB
    OR jsonb_typeof(legacy_github_evidence) IS DISTINCT FROM 'object'
    OR NOT (legacy_github_evidence ?& ARRAY[
      'schemaVersion', 'mode', 'providerKey', 'requestedUtcDate', 'evidenceCount'
    ])
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority has an invalid fixed provider set';
  END IF;
  v_cutoff := to_char(target_cutoff AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  IF target_cutoff < (target_date + 1)::TIMESTAMP AT TIME ZONE 'UTC' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority cutoff predates the UTC day boundary';
  END IF;
  v_github_mode := btrim(legacy_github_evidence->>'mode');
  IF legacy_github_evidence->>'schemaVersion' NOT IN (
      'reader_summary.production_recovery_github_evidence.v2',
      'reader_summary.production_recovery_github_evidence.v3'
    )
    OR legacy_github_evidence->>'providerKey' IS DISTINCT FROM 'github-trending-page'
    OR legacy_github_evidence->>'requestedUtcDate' IS DISTINCT FROM
      to_char(target_date, 'YYYY-MM-DD')
    OR v_github_mode NOT IN ('historical_unavailable', 'verified_existing', 'missing')
    OR COALESCE(legacy_github_evidence->>'evidenceCount', '') !~ '^[0-9]+$'
    OR jsonb_array_length(legacy_evidence->'github-trending-page') <>
      (legacy_github_evidence->>'evidenceCount')::INTEGER
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority GitHub evidence is invalid';
  END IF;
  v_github_count := (legacy_github_evidence->>'evidenceCount')::INTEGER;
  IF (
    target_date IN (DATE '2026-07-23', DATE '2026-07-28')
    AND (v_github_mode <> 'historical_unavailable' OR v_github_count <> 0)
  ) OR (
    target_date = DATE '2026-07-30'
    AND (v_github_mode <> 'missing' OR v_github_count <> 0)
  ) OR (
    target_date NOT IN (DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-30')
    AND (v_github_mode <> 'verified_existing' OR v_github_count <> 10)
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority GitHub mode is outside the reviewed date contract';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_each(legacy_evidence) AS provider(key, value)
    WHERE jsonb_typeof(provider.value) <> 'array'
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_each(legacy_evidence) AS provider(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(value)
    WHERE (
      NOT (evidence.value ?& ARRAY[
        'providerKey', 'feedItemId', 'sourceItemId', 'sourceBindingId', 'interestId',
        'canonicalUrl', 'title', 'bodyPreview', 'sourceContentHash',
        'sourceProviderContentHash', 'publishedAt', 'observedAt'
      ])
      OR evidence.value->>'providerKey' IS DISTINCT FROM provider.key
      OR evidence.value->>'feedItemId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR evidence.value->>'sourceItemId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR evidence.value->>'sourceBindingId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR evidence.value->>'interestId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(evidence.value->>'canonicalUrl', '') = ''
      OR COALESCE(evidence.value->>'title', '') = ''
      OR COALESCE(evidence.value->>'bodyPreview', '') = ''
      OR COALESCE(evidence.value->>'sourceContentHash', '') !~ '^[0-9a-f]{64}$'
      OR (
        evidence.value->'sourceProviderContentHash' <> 'null'::JSONB
        AND COALESCE(evidence.value->>'sourceProviderContentHash', '') !~ '^[0-9a-f]{64}$'
      )
      OR COALESCE(evidence.value->>'publishedAt', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR COALESCE(evidence.value->>'observedAt', '') !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR left(evidence.value->>'publishedAt', 10) <> to_char(target_date, 'YYYY-MM-DD')
      OR evidence.value->>'observedAt' > v_cutoff
      OR (evidence.value ? 'authorHandle'
        AND evidence.value->'authorHandle' <> 'null'::JSONB
        AND jsonb_typeof(evidence.value->'authorHandle') <> 'string')
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority legacy evidence is invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(legacy_evidence->'github-trending-page') AS evidence(value)
    WHERE jsonb_typeof(evidence.value->'github') IS DISTINCT FROM 'object'
      OR public.jsonb_object_length(evidence.value->'github') <> 6
      OR NOT (evidence.value->'github' ?& ARRAY[
        'resultId', 'scanJobId', 'scanAttemptNumber', 'repositoryIdentity', 'rank',
        'checkedAt'
      ])
      OR evidence.value->'github'->>'resultId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR evidence.value->'github'->>'scanJobId' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR evidence.value->'github'->>'scanAttemptNumber' !~ '^[1-9][0-9]*$'
      OR btrim(COALESCE(evidence.value->'github'->>'repositoryIdentity', '')) = ''
      OR evidence.value->'github'->>'rank' !~ '^[1-9][0-9]*$'
      OR evidence.value->'github'->>'checkedAt' !~
        '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      OR left(evidence.value->'github'->>'checkedAt', 10) <> to_char(target_date, 'YYYY-MM-DD')
      OR evidence.value->'github'->>'checkedAt' > v_cutoff
      OR evidence.value->>'publishedAt' > evidence.value->'github'->>'checkedAt'
      OR evidence.value->'github'->>'checkedAt' > evidence.value->>'observedAt'
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority frozen GitHub evidence is invalid';
  END IF;
  IF (
    SELECT count(*) <> count(DISTINCT evidence.value->>'feedItemId')
      OR count(*) <> count(DISTINCT evidence.value->>'sourceItemId')
    FROM jsonb_each(legacy_evidence) AS provider(key, value)
    CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(value)
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 source authority legacy evidence is duplicated';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'feedItemId', evidence.value->>'feedItemId',
    'sourceItemId', evidence.value->>'sourceItemId',
    'sourceBindingId', evidence.value->>'sourceBindingId',
    'interestId', evidence.value->>'interestId',
    'providerKey', evidence.value->>'providerKey',
    'canonicalUrl', evidence.value->>'canonicalUrl',
    'title', evidence.value->>'title',
    'bodyPreview', evidence.value->>'bodyPreview',
    'authorHandle', COALESCE(evidence.value->'authorHandle', 'null'::JSONB),
    'publishedAt', evidence.value->>'publishedAt',
    'observedAt', evidence.value->>'observedAt',
    'contentHash', evidence.value->>'sourceContentHash',
    'providerContentHash', evidence.value->'sourceProviderContentHash'
  ) ORDER BY provider.key, evidence.value->>'publishedAt', evidence.value->>'feedItemId'),
    '[]'::JSONB)
  INTO v_items
  FROM jsonb_each(legacy_evidence) AS provider(key, value)
  CROSS JOIN LATERAL jsonb_array_elements(provider.value) AS evidence(value);
  IF v_github_mode = 'verified_existing' THEN
    SELECT COALESCE(jsonb_agg(binding_id ORDER BY binding_id), '[]'::JSONB)
    INTO v_eligible_binding_ids
    FROM (
      SELECT DISTINCT evidence.value->>'sourceBindingId' AS binding_id
      FROM jsonb_array_elements(legacy_evidence->'github-trending-page')
        AS evidence(value)
    ) AS bindings;
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'feedItemId', evidence.value->>'feedItemId',
        'sourceItemId', evidence.value->>'sourceItemId',
        'sourceBindingId', evidence.value->>'sourceBindingId',
        'providerKey', 'github-trending-page',
        'canonicalUrl', evidence.value->>'canonicalUrl',
        'publishedAt', evidence.value->>'publishedAt',
        'observedAt', evidence.value->>'observedAt',
        'sourceContentHash', evidence.value->>'sourceContentHash',
        'sourceProviderContentHash',
          COALESCE(evidence.value->'sourceProviderContentHash', 'null'::JSONB)
      ) || jsonb_build_object(
        'scanJobId', evidence.value->'github'->>'scanJobId',
        'repositoryFullName', evidence.value->'github'->>'repositoryIdentity',
        'rank', (evidence.value->'github'->>'rank')::INTEGER,
        'checkedAtCollectionAnchor', evidence.value->'github'->>'checkedAt'
      ) ORDER BY evidence.value->>'sourceBindingId', evidence.value->>'observedAt',
        evidence.value->>'feedItemId'
    ), '[]'::JSONB)
    INTO v_github_items
    FROM jsonb_array_elements(legacy_evidence->'github-trending-page')
      AS evidence(value);
    IF jsonb_array_length(v_eligible_binding_ids) = 0
      OR jsonb_array_length(v_github_items) <> v_github_count THEN
      RAISE EXCEPTION 'daily canonical recovery v4 frozen GitHub projection is incomplete';
    END IF;
    v_page_count := (jsonb_array_length(v_eligible_binding_ids) / 1000) + 1;
    v_page_count := v_page_count + (jsonb_array_length(v_github_items) / 1000) + 1;
    v_github_projection := jsonb_build_object(
      'mode', 'checked_at_collection_anchor',
      'unavailableField', 'fetchStartedAt',
      'anchorField', 'checkedAtCollectionAnchor',
      'allowedRequestedUtcDates', jsonb_build_array(
        '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-29'
      ),
      'eligibleBindingIds', v_eligible_binding_ids,
      'items', v_github_items,
      'pageCount', v_page_count
    );
  ELSE
    IF jsonb_array_length(legacy_evidence->'github-trending-page') <> 0 THEN
      RAISE EXCEPTION 'daily canonical recovery v4 historical GitHub omission contains source items';
    END IF;
    v_github_projection := jsonb_build_object(
      'mode', 'historical_omission',
      'reason', c_historical_omission_reason,
      'authorizedAt', v_cutoff
    );
  END IF;
  RETURN jsonb_build_object(
    'schemaVersion', 2,
    'tenantId', target_tenant_id::TEXT,
    'workspaceId', target_workspace_id::TEXT,
    'requestedUtcDate', to_char(target_date, 'YYYY-MM-DD'),
    'ingestionCutoff', v_cutoff,
    'items', v_items,
    'githubProjection', v_github_projection
  );
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_ordered"()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_days JSONB;
  v_identity TEXT;
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy"();
  WITH legacy_days AS (
    SELECT day."requested_utc_date", day."canonical_sha256" AS day_sha,
      day."provider_evidence", day."github_evidence", lease."id" AS recovery_id,
      lease."canonical_record"->>'schemaVersion' AS recovery_schema,
      btrim(lease."canonical_sha256") AS recovery_sha,
      CASE lease."canonical_record"->>'schemaVersion'
        WHEN 'reader_summary.production_recovery_authority.v2' THEN
          lease."issued_at"
        ELSE (lease."canonical_record"->'boundaries'->>'authorityCutoffAt')::TIMESTAMPTZ
      END AS cutoff
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" IN (
        DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25',
        DATE '2026-07-26', DATE '2026-07-27', DATE '2026-07-28',
        DATE '2026-07-29', DATE '2026-07-30'
      )
  ), authorities AS (
    SELECT legacy_days.*, public."reader_summary_daily_canonical_recovery_v4_source_authority"(
      c_tenant_id, c_workspace_id, legacy_days."requested_utc_date",
      legacy_days.cutoff, legacy_days."provider_evidence", legacy_days."github_evidence"
    ) AS authority
    FROM legacy_days
  )
  SELECT jsonb_agg(jsonb_build_object(
    'requestedUtcDate', to_char("requested_utc_date", 'YYYY-MM-DD'),
    'legacy', jsonb_build_object(
      'schemaVersion', recovery_schema,
      'recoveryId', recovery_id::TEXT,
      'authoritySha256', recovery_sha,
      'dayCanonicalSha256', btrim(day_sha)
    ),
    'sourceAuthority', authority,
    'sourceAuthoritySha256', encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(authority), 'UTF8'
    )), 'hex')
  ) ORDER BY "requested_utc_date")
  INTO v_days
  FROM authorities;
  IF jsonb_array_length(COALESCE(v_days, '[]'::JSONB)) <> 8 THEN
    RAISE EXCEPTION 'daily canonical recovery v4 ordered authority lacks exact dates';
  END IF;
  v_identity := 'reader_summary.daily_canonical_recovery.v4:' || encode(
    sha256(convert_to(c_tenant_id::TEXT || ':' || c_workspace_id::TEXT ||
      ':2026-07-23,2026-07-24,2026-07-25,2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30',
      'UTF8')), 'hex'
  );
  RETURN jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_canonical_recovery.v4',
    'identity', v_identity,
    'tenantId', c_tenant_id::TEXT,
    'workspaceId', c_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array(
      '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'
    ),
    'boundaries', jsonb_build_object(
      'stage', 'pre_model',
      'recollectionPerformed', FALSE,
      'backdatingPerformed', FALSE,
      'providerWritePerformed', FALSE,
      'legacyAdoptionOnly', TRUE
    ),
    'modelContract', jsonb_build_object(
      'purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex',
      'model', 'gpt-5.6-sol',
      'reasoningEffort', 'xhigh',
      'runtimeEngine', 'subscription-runtime-cli',
      'selectedOutputKind', 'output_text'
    ),
    'days', v_days
  );
END;
$function$;

-- A deliberately different traversal proves the persisted plan is independent
-- of SQL scan/order implementation, not merely a repeated call to one query.
CREATE FUNCTION public."reader_summary_daily_canonical_recovery_v4_plan_grouped"()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_date DATE;
  v_day RECORD;
  v_authority JSONB;
  v_days JSONB := '[]'::JSONB;
  v_identity TEXT;
BEGIN
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_legacy"();
  FOR v_date IN SELECT unnest(ARRAY[
    DATE '2026-07-23', DATE '2026-07-24', DATE '2026-07-25', DATE '2026-07-26',
    DATE '2026-07-27', DATE '2026-07-28', DATE '2026-07-29', DATE '2026-07-30'
  ]) LOOP
    SELECT day."canonical_sha256" AS day_sha,
      day."provider_evidence", day."github_evidence", lease."id" AS recovery_id,
      lease."canonical_record"->>'schemaVersion' AS recovery_schema,
      btrim(lease."canonical_sha256") AS recovery_sha,
      CASE lease."canonical_record"->>'schemaVersion'
        WHEN 'reader_summary.production_recovery_authority.v2' THEN
          lease."issued_at"
        ELSE (lease."canonical_record"->'boundaries'->>'authorityCutoffAt')::TIMESTAMPTZ
      END AS cutoff
    INTO STRICT v_day
    FROM public."reader_summary_production_recovery_days" AS day
    JOIN public."reader_summary_production_recovery_leases" AS lease
      ON lease."id" = day."recovery_id"
    WHERE day."tenant_id" = c_tenant_id
      AND day."workspace_id" = c_workspace_id
      AND day."requested_utc_date" = v_date;
    v_authority := public."reader_summary_daily_canonical_recovery_v4_source_authority"(
      c_tenant_id, c_workspace_id, v_date, v_day.cutoff, v_day."provider_evidence",
      v_day."github_evidence"
    );
    v_days := v_days || jsonb_build_array(jsonb_build_object(
      'requestedUtcDate', to_char(v_date, 'YYYY-MM-DD'),
      'legacy', jsonb_build_object(
        'schemaVersion', v_day.recovery_schema,
        'recoveryId', v_day.recovery_id::TEXT,
        'authoritySha256', v_day.recovery_sha,
        'dayCanonicalSha256', btrim(v_day.day_sha)
      ),
      'sourceAuthority', v_authority,
      'sourceAuthoritySha256', encode(sha256(convert_to(
        public."reader_summary_weekly_canonical_json_unbounded"(v_authority), 'UTF8'
      )), 'hex')
    ));
  END LOOP;
  v_identity := 'reader_summary.daily_canonical_recovery.v4:' || encode(
    sha256(convert_to(c_tenant_id::TEXT || ':' || c_workspace_id::TEXT ||
      ':2026-07-23,2026-07-24,2026-07-25,2026-07-26,2026-07-27,2026-07-28,2026-07-29,2026-07-30',
      'UTF8')), 'hex'
  );
  RETURN jsonb_build_object(
    'schemaVersion', 'reader_summary.daily_canonical_recovery.v4',
    'identity', v_identity,
    'tenantId', c_tenant_id::TEXT,
    'workspaceId', c_workspace_id::TEXT,
    'requestedUtcDates', jsonb_build_array(
      '2026-07-23', '2026-07-24', '2026-07-25', '2026-07-26',
      '2026-07-27', '2026-07-28', '2026-07-29', '2026-07-30'
    ),
    'boundaries', jsonb_build_object(
      'stage', 'pre_model',
      'recollectionPerformed', FALSE,
      'backdatingPerformed', FALSE,
      'providerWritePerformed', FALSE,
      'legacyAdoptionOnly', TRUE
    ),
    'modelContract', jsonb_build_object(
      'purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex',
      'model', 'gpt-5.6-sol',
      'reasoningEffort', 'xhigh',
      'runtimeEngine', 'subscription-runtime-cli',
      'selectedOutputKind', 'output_text'
    ),
    'days', v_days
  );
END;
$function$;

CREATE FUNCTION public."assert_reader_summary_daily_canonical_recovery_v4_binding"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_first public."reader_summary_daily_canonical_recovery_v4_plans"%ROWTYPE;
  v_second public."reader_summary_daily_canonical_recovery_v4_plans"%ROWTYPE;
  v_count INTEGER;
BEGIN
  SELECT * INTO STRICT v_first
  FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id AND plan."workspace_id" = c_workspace_id
    AND plan."ordinal" = 1 FOR KEY SHARE;
  SELECT * INTO STRICT v_second
  FROM public."reader_summary_daily_canonical_recovery_v4_plans" AS plan
  WHERE plan."tenant_id" = c_tenant_id AND plan."workspace_id" = c_workspace_id
    AND plan."ordinal" = 2 FOR KEY SHARE;
  IF v_first."canonical_record" IS DISTINCT FROM v_second."canonical_record"
    OR v_first."canonical_bytes" IS DISTINCT FROM v_second."canonical_bytes"
    OR btrim(v_first."canonical_sha256") IS DISTINCT FROM btrim(v_second."canonical_sha256")
    OR v_first."canonical_bytes" IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_first."canonical_record"), 'UTF8'
    )
    OR btrim(v_first."canonical_sha256") IS DISTINCT FROM
      encode(sha256(v_first."canonical_bytes"), 'hex')
    OR v_first."canonical_record"->>'schemaVersion' IS DISTINCT FROM
      'reader_summary.daily_canonical_recovery.v4'
    OR v_first."canonical_record"->'requestedUtcDates' IS DISTINCT FROM
      '["2026-07-23","2026-07-24","2026-07-25","2026-07-26","2026-07-27","2026-07-28","2026-07-29","2026-07-30"]'::JSONB
    OR v_first."canonical_record"->'modelContract' IS DISTINCT FROM jsonb_build_object(
      'purpose', 'social_monitor.reader_summary.weekly.generate',
      'provider', 'codex', 'model', 'gpt-5.6-sol',
      'reasoningEffort', 'xhigh', 'runtimeEngine', 'subscription-runtime-cli',
      'selectedOutputKind', 'output_text'
    )
  THEN
    RAISE EXCEPTION 'daily canonical recovery v4 two-plan authority diverged';
  END IF;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
  WHERE authority."tenant_id" = c_tenant_id AND authority."workspace_id" = c_workspace_id;
  IF v_count <> 8 OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_first."canonical_record"->'days') AS planned(value)
    LEFT JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
      ON authority."tenant_id" = c_tenant_id
      AND authority."workspace_id" = c_workspace_id
      AND to_char(authority."requested_utc_date", 'YYYY-MM-DD') =
        planned.value->>'requestedUtcDate'
    WHERE authority."requested_utc_date" IS NULL
      OR authority."source_authority_record" IS DISTINCT FROM
        planned.value->'sourceAuthority'
      OR authority."source_authority_record"->>'schemaVersion' IS DISTINCT FROM '2'
      OR jsonb_typeof(authority."source_authority_record"->'githubProjection')
        IS DISTINCT FROM 'object'
      OR (
        authority."requested_utc_date" IN (
          DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-30'
        ) AND (
          public.jsonb_object_length(authority."source_authority_record"->'githubProjection')
            IS DISTINCT FROM 3
          OR NOT COALESCE(
            authority."source_authority_record"->'githubProjection' ?& ARRAY[
              'mode', 'reason', 'authorizedAt'
            ], FALSE
          )
          OR authority."source_authority_record"->'githubProjection'->>'mode'
            IS DISTINCT FROM 'historical_omission'
          OR authority."source_authority_record"->'githubProjection'->>'reason'
            IS DISTINCT FROM
              'Reviewed immutable recovery authority contains no eligible GitHub trending projection for this UTC day.'
          OR authority."source_authority_record"->'githubProjection'->>'authorizedAt'
            IS DISTINCT FROM authority."source_authority_record"->>'ingestionCutoff'
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(authority."source_authority_record"->'items')
              AS source(value)
            WHERE source.value->>'providerKey' = 'github-trending-page'
          )
        )
      )
      OR (
        authority."requested_utc_date" NOT IN (
          DATE '2026-07-23', DATE '2026-07-28', DATE '2026-07-30'
        ) AND (
          public.jsonb_object_length(authority."source_authority_record"->'githubProjection')
            IS DISTINCT FROM 7
          OR NOT COALESCE(
            authority."source_authority_record"->'githubProjection' ?& ARRAY[
              'mode', 'unavailableField', 'anchorField', 'allowedRequestedUtcDates',
              'eligibleBindingIds', 'items', 'pageCount'
            ], FALSE
          )
          OR authority."source_authority_record"->'githubProjection'->>'mode'
            IS DISTINCT FROM 'checked_at_collection_anchor'
          OR authority."source_authority_record"->'githubProjection'->>'unavailableField'
            IS DISTINCT FROM 'fetchStartedAt'
          OR authority."source_authority_record"->'githubProjection'->>'anchorField'
            IS DISTINCT FROM 'checkedAtCollectionAnchor'
          OR authority."source_authority_record"->'githubProjection'->'allowedRequestedUtcDates'
            IS DISTINCT FROM jsonb_build_array(
              '2026-07-24', '2026-07-25', '2026-07-26', '2026-07-27', '2026-07-29'
            )
          OR jsonb_typeof(
            authority."source_authority_record"->'githubProjection'->'eligibleBindingIds'
          ) IS DISTINCT FROM 'array'
          OR jsonb_typeof(
            authority."source_authority_record"->'githubProjection'->'items'
          ) IS DISTINCT FROM 'array'
          OR authority."source_authority_record"->'githubProjection'->>'pageCount'
            !~ '^[1-9][0-9]*$'
          OR authority."source_authority_record"->'githubProjection'->'eligibleBindingIds'
            IS DISTINCT FROM (
              SELECT COALESCE(jsonb_agg(binding_id ORDER BY binding_id), '[]'::JSONB)
              FROM (
                SELECT DISTINCT source.value->>'sourceBindingId' AS binding_id
                FROM jsonb_array_elements(authority."source_authority_record"->'items')
                  AS source(value)
                WHERE source.value->>'providerKey' = 'github-trending-page'
              ) AS expected_binding
            )
          OR (
            SELECT count(*)
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
          ) IS DISTINCT FROM (
            SELECT count(*)
            FROM jsonb_array_elements(authority."source_authority_record"->'items')
              AS source(value)
            WHERE source.value->>'providerKey' = 'github-trending-page'
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
            WHERE jsonb_typeof(projection.value) IS DISTINCT FROM 'object'
              OR NOT (projection.value ?& ARRAY[
                'feedItemId', 'sourceItemId', 'sourceBindingId', 'providerKey',
                'canonicalUrl', 'publishedAt', 'observedAt', 'sourceContentHash',
                'sourceProviderContentHash'
              ])
              OR projection.value - ARRAY[
                'feedItemId', 'sourceItemId', 'sourceBindingId', 'providerKey',
                'canonicalUrl', 'publishedAt', 'observedAt', 'sourceContentHash',
                'sourceProviderContentHash', 'scanJobId', 'repositoryFullName',
                'rank', 'checkedAtCollectionAnchor'
              ]::TEXT[] <> '{}'::JSONB
              OR public.jsonb_object_length(projection.value) <> 13
              OR projection.value->>'providerKey' IS DISTINCT FROM 'github-trending-page'
              OR projection.value->>'scanJobId' !~
                '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              OR btrim(COALESCE(projection.value->>'repositoryFullName', '')) = ''
              OR projection.value->>'rank' !~ '^[1-9][0-9]*$'
              OR projection.value->>'checkedAtCollectionAnchor' !~
                '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
              OR left(projection.value->>'checkedAtCollectionAnchor', 10) <>
                authority."source_authority_record"->>'requestedUtcDate'
              OR projection.value->>'checkedAtCollectionAnchor' >
                authority."source_authority_record"->>'ingestionCutoff'
              OR NOT EXISTS (
                SELECT 1
                FROM jsonb_array_elements(authority."source_authority_record"->'items')
                  AS source(value)
                WHERE source.value->>'providerKey' = 'github-trending-page'
                  AND source.value->>'feedItemId' = projection.value->>'feedItemId'
                  AND source.value->>'sourceItemId' = projection.value->>'sourceItemId'
                  AND source.value->>'sourceBindingId' = projection.value->>'sourceBindingId'
                  AND source.value->>'canonicalUrl' = projection.value->>'canonicalUrl'
                  AND source.value->>'publishedAt' = projection.value->>'publishedAt'
                  AND source.value->>'observedAt' = projection.value->>'observedAt'
                  AND source.value->>'contentHash' = projection.value->>'sourceContentHash'
                  AND source.value->'providerContentHash' IS NOT DISTINCT FROM
                    projection.value->'sourceProviderContentHash'
                  AND source.value->>'publishedAt' <=
                    projection.value->>'checkedAtCollectionAnchor'
                  AND projection.value->>'checkedAtCollectionAnchor' <=
                    source.value->>'observedAt'
              )
          )
          OR (
            SELECT count(*)
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
          ) <> 10
          OR (
            SELECT count(DISTINCT projection.value->>'feedItemId')
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
          ) <> 10
          OR (
            SELECT count(DISTINCT projection.value->>'sourceItemId')
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
          ) <> 10
          OR (
            SELECT count(DISTINCT (projection.value->>'rank')::INTEGER)
            FROM jsonb_array_elements(
              authority."source_authority_record"->'githubProjection'->'items'
            ) AS projection(value)
          ) <> 10
          OR EXISTS (
            SELECT 1
            FROM (
              SELECT concat_ws('|', projection.value->>'sourceBindingId',
                  projection.value->>'observedAt', projection.value->>'feedItemId'
                ) AS projection_order,
                lag(concat_ws('|', projection.value->>'sourceBindingId',
                  projection.value->>'observedAt', projection.value->>'feedItemId'
                )) OVER (ORDER BY projection.ordinality) AS previous_order
              FROM jsonb_array_elements(
                authority."source_authority_record"->'githubProjection'->'items'
              ) WITH ORDINALITY AS projection(value, ordinality)
            ) AS ordered_projection
            WHERE ordered_projection.previous_order IS NOT NULL
              AND ordered_projection.projection_order <= ordered_projection.previous_order
          )
          OR (authority."source_authority_record"->'githubProjection'->>'pageCount')::INTEGER
            IS DISTINCT FROM (
              (jsonb_array_length(
                authority."source_authority_record"->'githubProjection'->'eligibleBindingIds'
              ) / 1000) + 1 +
              CASE WHEN jsonb_array_length(
                authority."source_authority_record"->'githubProjection'->'eligibleBindingIds'
              ) = 0 THEN 0 ELSE (jsonb_array_length(
                authority."source_authority_record"->'githubProjection'->'items'
              ) / 1000) + 1 END
            )
        )
      )
      OR btrim(authority."source_authority_sha256") IS DISTINCT FROM
        planned.value->>'sourceAuthoritySha256'
      OR authority."source_authority_bytes" IS DISTINCT FROM convert_to(
        public."reader_summary_weekly_canonical_json_unbounded"(authority."source_authority_record"),
        'UTF8'
      )
      OR btrim(authority."source_authority_sha256") IS DISTINCT FROM
        encode(sha256(authority."source_authority_bytes"), 'hex')
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 adopted authority diverged';
  END IF;
  SELECT count(*)::INTEGER INTO v_count
  FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id;
  IF v_count <> 8 OR EXISTS (
    SELECT 1
    FROM public."reader_summary_daily_canonical_recovery_v4_leases" AS lease
    JOIN public."reader_summary_daily_canonical_recovery_v4_authorities" AS authority
      USING ("tenant_id", "workspace_id", "requested_utc_date")
    WHERE lease."tenant_id" = c_tenant_id AND lease."workspace_id" = c_workspace_id
      AND (
        btrim(lease."source_authority_sha256") IS DISTINCT FROM
          btrim(authority."source_authority_sha256")
        OR btrim(lease."model_job_identity") IS DISTINCT FROM
          public."reader_summary_daily_canonical_recovery_v4_model_identity"(
            lease."tenant_id", lease."workspace_id", lease."requested_utc_date",
            btrim(authority."source_authority_sha256")
          )
      )
  ) THEN
    RAISE EXCEPTION 'daily canonical recovery v4 durable lease binding diverged';
  END IF;
END;
$function$;

-- The ordinary evidence recorder requires live GitHub facts that the sealed
-- recovery authority deliberately does not claim. Keep ordinary publication
-- untouched and dispatch only an exact V4-marked audit to this narrow path.
ALTER FUNCTION public."record_reader_summary_weekly_publication_evidence"(UUID)
  RENAME TO "record_reader_summary_weekly_publication_evidence_base";

CREATE FUNCTION public."record_reader_summary_daily_canonical_recovery_v4_evidence"(
  target_publication_id UUID
) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog AS $function$
DECLARE
  v_artifact public."reader_summary_artifacts"%ROWTYPE;
  v_authority public."reader_summary_daily_canonical_recovery_v4_authorities"%ROWTYPE;
  v_existing public."reader_summary_weekly_publication_evidence"%ROWTYPE;
  v_job public."reader_summary_jobs"%ROWTYPE;
  v_lease public."reader_summary_daily_canonical_recovery_v4_leases"%ROWTYPE;
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
  SELECT * INTO STRICT v_lease
  FROM public."reader_summary_daily_canonical_recovery_v4_leases"
  WHERE "tenant_id" = v_authority."tenant_id"
    AND "workspace_id" = v_authority."workspace_id"
    AND "requested_utc_date" = v_authority."requested_utc_date"
  FOR KEY SHARE;
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
  -- Headline and executive summary are direct model fields. Structured story,
  -- citation, confidence and content fields pass deterministic domain policies;
  -- they are bound below to frozen source rows and the exact report hash.
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

CREATE FUNCTION public."record_reader_summary_weekly_publication_evidence"(
  target_publication_id UUID
) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog AS $function$
DECLARE
  v_recovery JSONB;
BEGIN
  SELECT artifact."quality_signals"->'githubProjectionAudit'->'recoveryV4'
  INTO v_recovery
  FROM public."reader_summary_publications" AS publication
  JOIN public."reader_summary_artifacts" AS artifact
    ON artifact."id" = publication."reader_summary_artifact_id"
  WHERE publication."id" = target_publication_id;
  IF jsonb_typeof(v_recovery) = 'object'
    AND v_recovery->>'recoveryVersion' = 'reader_summary.daily_canonical_recovery.v4' THEN
    PERFORM public."record_reader_summary_daily_canonical_recovery_v4_evidence"(
      target_publication_id
    );
  ELSE
    PERFORM public."record_reader_summary_weekly_publication_evidence_base"(
      target_publication_id
    );
  END IF;
END;
$function$;

ALTER TABLE public."reader_summary_weekly_publication_evidence"
  DROP CONSTRAINT "reader_summary_weekly_publication_evidence_semantics_check";
ALTER TABLE public."reader_summary_weekly_publication_evidence"
  ADD CONSTRAINT "reader_summary_weekly_publication_evidence_semantics_check" CHECK (
    COALESCE(jsonb_typeof("report") = 'object', FALSE)
    AND COALESCE(jsonb_typeof("report"->'citations') = 'array', FALSE)
    AND COALESCE(jsonb_typeof("provider_evidence") = 'array', FALSE)
    AND COALESCE(jsonb_typeof("github_evidence") = 'object', FALSE)
    AND (("semantic_status" = 'NO_SIGNAL' AND "report"->'citations' = '[]'::JSONB
      AND "provider_evidence" = '[]'::JSONB
      AND "github_evidence"->>'mode' IN (
        'ordinary_not_required', 'historical_unavailable',
        'canonical_recovery_checked_at_collection_anchor'
      ) AND "github_evidence"->>'evidenceCount' = '0'
      AND "github_evidence"->'repositories' = '[]'::JSONB)
      OR ("semantic_status" = 'COMPLETED'
        AND jsonb_array_length("provider_evidence") > 0
        AND "github_evidence"->>'mode' <> 'ordinary_not_required'))
  );

CREATE FUNCTION public."bootstrap_reader_summary_daily_canonical_recovery_v4"()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
DECLARE
  c_tenant_id CONSTANT UUID := '00000000-0000-7000-8000-000000000901';
  c_workspace_id CONSTANT UUID := '00000000-0000-7000-8000-000000000902';
  v_first JSONB;
  v_second JSONB;
  v_bytes BYTEA;
  v_sha TEXT;
  v_day JSONB;
  v_authority JSONB;
  v_authority_bytes BYTEA;
  v_authority_sha TEXT;
  v_matching_legacy_authority_count INTEGER;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable'
    OR current_setting('transaction_read_only') <> 'off' THEN
    RAISE EXCEPTION 'daily canonical recovery v4 bootstrap requires SERIALIZABLE writable transaction';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public."reader_summary_daily_canonical_recovery_v4_plans"
    WHERE "tenant_id" = c_tenant_id AND "workspace_id" = c_workspace_id
  ) THEN
    PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
    RETURN;
  END IF;
  -- Normal ordered baseline upgrades may not yet carry both immutable recovery
  -- authorities. Preserve that empty state until the bounded maintenance runner
  -- prepares the missing pre-model authority; the first runtime claim retries
  -- this exact bootstrap before admitting any model call.
  SELECT count(*)::INTEGER INTO v_matching_legacy_authority_count
  FROM public."reader_summary_production_recovery_leases" AS lease
  WHERE lease."tenant_id" = c_tenant_id
    AND lease."workspace_id" = c_workspace_id
    AND (
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_authority.v2'
       AND lease."canonical_record"->'requestedUtcDates' = jsonb_build_array(
         '2026-07-23', '2026-07-24', '2026-07-25',
         '2026-07-26', '2026-07-27', '2026-07-28'
       ))
      OR
      (lease."canonical_record"->>'schemaVersion' =
        'reader_summary.production_recovery_gap_authority.v3'
       AND lease."canonical_record"->'requestedUtcDates' = jsonb_build_array(
         '2026-07-29', '2026-07-30', '2026-07-31'
       ))
    );
  IF v_matching_legacy_authority_count < 2 THEN
    RETURN;
  END IF;
  v_first := public."reader_summary_daily_canonical_recovery_v4_plan_ordered"();
  v_second := public."reader_summary_daily_canonical_recovery_v4_plan_grouped"();
  v_bytes := convert_to(public."reader_summary_weekly_canonical_json_unbounded"(v_first), 'UTF8');
  v_sha := encode(sha256(v_bytes), 'hex');
  IF v_first IS DISTINCT FROM v_second
    OR v_bytes IS DISTINCT FROM convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_second), 'UTF8'
    )
    OR v_sha IS DISTINCT FROM encode(sha256(convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_second), 'UTF8'
    )), 'hex') THEN
    RAISE EXCEPTION 'daily canonical recovery v4 plans are not independently byte-identical';
  END IF;
  INSERT INTO public."reader_summary_daily_canonical_recovery_v4_plans" (
    "tenant_id", "workspace_id", "ordinal", "canonical_record", "canonical_bytes",
    "canonical_sha256", "adopted_at"
  ) VALUES
    (c_tenant_id, c_workspace_id, 1, v_first, v_bytes, v_sha, transaction_timestamp()),
    (c_tenant_id, c_workspace_id, 2, v_second, v_bytes, v_sha, transaction_timestamp());
  FOR v_day IN SELECT value FROM jsonb_array_elements(v_first->'days') AS entry(value)
  LOOP
    v_authority := v_day->'sourceAuthority';
    v_authority_bytes := convert_to(
      public."reader_summary_weekly_canonical_json_unbounded"(v_authority), 'UTF8'
    );
    v_authority_sha := encode(sha256(v_authority_bytes), 'hex');
    IF v_authority_sha IS DISTINCT FROM v_day->>'sourceAuthoritySha256' THEN
      RAISE EXCEPTION 'daily canonical recovery v4 source authority hash diverged';
    END IF;
    INSERT INTO public."reader_summary_daily_canonical_recovery_v4_authorities" (
      "tenant_id", "workspace_id", "requested_utc_date", "legacy_recovery_id",
      "legacy_day_canonical_sha256", "source_authority_record",
      "source_authority_bytes", "source_authority_sha256", "adopted_at"
    ) VALUES (
      c_tenant_id, c_workspace_id, (v_day->>'requestedUtcDate')::DATE,
      (v_day->'legacy'->>'recoveryId')::UUID,
      v_day->'legacy'->>'dayCanonicalSha256', v_authority,
      v_authority_bytes, v_authority_sha, transaction_timestamp()
    );
    INSERT INTO public."reader_summary_daily_canonical_recovery_v4_leases" (
      "tenant_id", "workspace_id", "requested_utc_date", "source_authority_sha256",
      "model_job_identity", "state"
    ) VALUES (
      c_tenant_id, c_workspace_id, (v_day->>'requestedUtcDate')::DATE,
      v_authority_sha,
      public."reader_summary_daily_canonical_recovery_v4_model_identity"(
        c_tenant_id, c_workspace_id, (v_day->>'requestedUtcDate')::DATE,
        v_authority_sha
      ),
      'READY'
    );
  END LOOP;
  PERFORM public."assert_reader_summary_daily_canonical_recovery_v4_binding"();
END;
$function$;

SELECT public."bootstrap_reader_summary_daily_canonical_recovery_v4"();

REVOKE ALL PRIVILEGES ON TABLE
  public."reader_summary_daily_canonical_recovery_v4_plans",
  public."reader_summary_daily_canonical_recovery_v4_authorities",
  public."reader_summary_daily_canonical_recovery_v4_leases"
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."bootstrap_reader_summary_daily_canonical_recovery_v4"(),
  public."reader_summary_daily_canonical_recovery_v4_plan_ordered"(),
  public."reader_summary_daily_canonical_recovery_v4_plan_grouped"(),
  public."assert_reader_summary_daily_canonical_recovery_v4_binding"(),
  public."assert_reader_summary_daily_canonical_recovery_v4_legacy"(),
  public."reject_reader_summary_daily_canonical_recovery_v4_plan_mutation"(),
  public."reject_rs_daily_recovery_v4_authority_mutation"()
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";
REVOKE ALL ON FUNCTION public."reader_summary_daily_canonical_recovery_v4_source_authority"(
  UUID, UUID, DATE, TIMESTAMPTZ, JSONB, JSONB),
  public."reader_summary_daily_canonical_recovery_v4_model_identity"(
    UUID, UUID, DATE, TEXT)
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner" CASCADE;
RESET ROLE;
COMMIT;
