-- @social-monitor-forward-migration
-- Admit Terra/medium without changing historical weekly evidence.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public."reader_summary_weekly_review_attestation_valid"(
  attestation JSONB, selected_output_sha256 TEXT
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $function$
SELECT (
  jsonb_typeof(attestation) = 'object'
  AND jsonb_typeof(attestation->'schemaVersion') = 'number'
  AND attestation->>'schemaVersion' = '1'
  AND jsonb_typeof(attestation->'requestId') = 'string'
  AND length(btrim(attestation->>'requestId')) BETWEEN 1 AND 512
  AND attestation->>'purpose' = 'social_monitor.reader_summary.weekly.review.v2'
  AND attestation->>'provider' = 'codex'
  AND jsonb_typeof(attestation->'canonicalRequestSha256') = 'string'
  AND attestation->>'canonicalRequestSha256' ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof(attestation->'launcherSha256') = 'string'
  AND attestation->>'launcherSha256' ~ '^[0-9a-f]{64}$'
  AND jsonb_typeof(attestation->'runtimePackageVersion') = 'string'
  AND attestation->>'runtimePackageVersion' ~
    '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'
  AND attestation->>'selectedOutputKind' = 'structured_output'
  AND jsonb_typeof(attestation->'selectedOutputSha256') = 'string'
  AND attestation->>'selectedOutputSha256' = selected_output_sha256
  AND selected_output_sha256 ~ '^[0-9a-f]{64}$'
  AND attestation ?& ARRAY[
    'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
    'provider', 'model', 'reasoningEffort', 'runtimeEngine',
    'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
    'selectedOutputSha256'
  ]::TEXT[]
  AND (
    (
      attestation->>'runtimeEngine' = 'subscription-runtime-cli'
      AND attestation->>'model' = 'gpt-5.6-sol'
      AND attestation->>'reasoningEffort' = 'high'
      AND attestation - ARRAY[
        'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
        'provider', 'model', 'reasoningEffort', 'runtimeEngine',
        'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
        'selectedOutputSha256'
      ]::TEXT[] = '{}'::JSONB
    ) OR (
      attestation->>'runtimeEngine' = 'gateway-llm'
      AND attestation - ARRAY[
        'schemaVersion', 'requestId', 'purpose', 'canonicalRequestSha256',
        'provider', 'model', 'reasoningEffort', 'runtimeEngine',
        'runtimePackageVersion', 'launcherSha256', 'selectedOutputKind',
        'selectedOutputSha256', 'gateway'
      ]::TEXT[] = '{}'::JSONB
      AND attestation ? 'gateway'
      AND attestation->>'runtimePackageVersion' = '0.1.0-llm.0f3827f'
      AND attestation->>'launcherSha256' =
        '5b1ec4ee7d17bfe5a6871e51598a040192dd69f539a0966eb9112e12b2c1694e'
      AND (
        (attestation->>'model' = 'gpt-6.1-terra' AND attestation->>'reasoningEffort' = 'medium')
        OR (attestation->>'model' = 'gpt-6.1-sol' AND attestation->>'reasoningEffort' = 'low')
        OR (attestation->>'model' = 'gpt-5.6-sol' AND attestation->>'reasoningEffort' = 'high')
      )
      AND jsonb_typeof(attestation->'gateway') = 'object'
      AND (attestation->'gateway') - ARRAY[
        'profileId', 'taskId', 'attempt', 'executionRef', 'requestRef',
        'accountRef', 'observedModel', 'requestSha256'
      ]::TEXT[] = '{}'::JSONB
      AND (attestation->'gateway') ?& ARRAY[
        'profileId', 'taskId', 'attempt', 'executionRef', 'requestRef',
        'accountRef', 'observedModel', 'requestSha256'
      ]::TEXT[]
      AND attestation->'gateway'->>'profileId' = 'openai-codex-oauth-responses-v1'
      AND jsonb_typeof(attestation->'gateway'->'taskId') = 'string'
      AND attestation->'gateway'->>'taskId' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
      AND jsonb_typeof(attestation->'gateway'->'executionRef') = 'string'
      AND attestation->'gateway'->>'executionRef' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
      AND jsonb_typeof(attestation->'gateway'->'requestRef') = 'string'
      AND attestation->'gateway'->>'requestRef' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
      AND jsonb_typeof(attestation->'gateway'->'accountRef') = 'string'
      AND attestation->'gateway'->>'accountRef' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
      AND CASE WHEN jsonb_typeof(attestation->'gateway'->'attempt') = 'number' THEN
        (attestation->'gateway'->>'attempt')::NUMERIC BETWEEN 1 AND 9007199254740991
        AND (attestation->'gateway'->>'attempt')::NUMERIC =
          trunc((attestation->'gateway'->>'attempt')::NUMERIC)
        ELSE FALSE END
      AND jsonb_typeof(attestation->'gateway'->'requestSha256') = 'string'
      AND attestation->'gateway'->>'requestSha256' ~ '^[0-9a-f]{64}$'
      AND (
        attestation->'gateway'->'observedModel' = 'null'::JSONB
        OR (
          jsonb_typeof(attestation->'gateway'->'observedModel') = 'string'
          AND (
            attestation->'gateway'->>'observedModel' = attestation->>'model'
            OR (
              left(attestation->'gateway'->>'observedModel', length(attestation->>'model')) =
                attestation->>'model'
              AND substring(attestation->'gateway'->>'observedModel'
                FROM length(attestation->>'model') + 1) ~ '^-[0-9]{4}(-[0-9]{2}-[0-9]{2})?$'
            )
          )
        )
      )
    )
  )
) IS TRUE;
$function$;


SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
