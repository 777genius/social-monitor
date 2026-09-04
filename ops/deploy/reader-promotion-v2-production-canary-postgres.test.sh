#!/usr/bin/env bash
# shellcheck disable=SC2126,SC2251
# Negated commands and cross-file race counts are intentional test assertions.
set -euo pipefail

REPO=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
bootstrap="$REPO/ops/deploy/reader-promotion-v2-canary-control-bootstrap.sql"
expect_failure() {
  if "$@"; then
    echo 'expected SQL refusal, but the command succeeded' >&2
    exit 1
  fi
}
# An inverted command alone is exempt from errexit and is not an assertion.
if (expect_failure true) >/dev/null 2>&1; then
  echo 'negative assertion helper did not reject success' >&2
  exit 1
fi
container=
database=promotion_canary_test
cleanup() {
  [[ -z $container ]] || docker rm -f "$container" >/dev/null 2>&1 || true
  [[ -z ${race_one:-} ]] || rm -f "$race_one"
  [[ -z ${race_two:-} ]] || rm -f "$race_two"
}
trap cleanup EXIT HUP INT TERM

hostport=${CANARY_PG_TEST_HOSTPORT:-}
if [[ -z $hostport ]]; then
  container="social-monitor-promotion-canary-pg-$$-$RANDOM"
  docker run --detach --rm --name "$container" \
    --env POSTGRES_HOST_AUTH_METHOD=trust --env POSTGRES_DB="$database" \
    --publish 127.0.0.1::5432 postgres:18.4-alpine >/dev/null
  port=$(docker port "$container" 5432/tcp | sed -E 's/.*:([0-9]+)$/\1/')
  hostport=127.0.0.1:$port
  ready=false
  for _ in $(seq 1 60); do
    # The image first starts a temporary Unix-only initialization server.
    # Probe the same host TCP endpoint that all following assertions use.
    if PGCONNECT_TIMEOUT=2 psql "postgresql://postgres@$hostport/$database" \
        -XAt -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [[ $ready == true ]] || {
    echo 'canary PostgreSQL test TCP endpoint did not become ready' >&2
    exit 1
  }
else
  psql "postgresql://postgres@$hostport/postgres" -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE $database" >/dev/null
fi
server="postgresql://postgres@$hostport"
invoker_server="postgresql://social_monitor_reader_promotion_canary_invoker@$hostport"
admin="$server/$database"
invoker="$invoker_server/$database"

psql "$admin" -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE social_monitor_reader_promotion_canary_owner BYPASSRLS;
CREATE ROLE social_monitor_reader_promotion_canary_invoker LOGIN BYPASSRLS;
CREATE TABLE public.tenants(id integer);
CREATE TABLE public.reader_summaries(id integer);
CREATE TABLE public.reader_summary_publications(id integer);
CREATE TABLE public.outbox_events(id integer);
CREATE TABLE public.delivery_attempts(id integer);
CREATE TABLE public.notification_preferences(id integer);
SQL
expect_failure psql "$admin" -v ON_ERROR_STOP=1 -f "$bootstrap" \
  >/dev/null 2>&1
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 't|2'
SELECT to_regnamespace('reader_promotion_v2_canary_control') IS NULL,
  count(*) FROM pg_roles WHERE rolbypassrls AND rolname IN (
    'social_monitor_reader_promotion_canary_owner',
    'social_monitor_reader_promotion_canary_invoker');
SQL
psql "$admin" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
DROP ROLE social_monitor_reader_promotion_canary_owner;
DROP ROLE social_monitor_reader_promotion_canary_invoker;
CREATE ROLE social_monitor_reader_promotion_canary_invoker LOGIN NOINHERIT CONNECTION LIMIT 2;
GRANT SELECT ON public.tenants TO social_monitor_reader_promotion_canary_invoker;
SQL
expect_failure psql "$admin" -v ON_ERROR_STOP=1 -f "$bootstrap" \
  >/dev/null 2>&1
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 't|t'
SELECT to_regnamespace('reader_promotion_v2_canary_control') IS NULL,
  has_table_privilege('social_monitor_reader_promotion_canary_invoker',
    'public.tenants', 'SELECT');
SQL
psql "$admin" -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
REVOKE SELECT ON public.tenants FROM social_monitor_reader_promotion_canary_invoker;
DROP ROLE social_monitor_reader_promotion_canary_invoker;
CREATE ROLE canary_bootstrap_unprivileged LOGIN CREATEROLE NOINHERIT;
SQL
expect_failure psql \
  "postgresql://canary_bootstrap_unprivileged@$hostport/$database" \
  -v ON_ERROR_STOP=1 -f "$bootstrap" >/dev/null 2>&1
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 't|0'
SELECT to_regnamespace('reader_promotion_v2_canary_control') IS NULL,
  count(*) FROM pg_roles WHERE rolname IN (
    'social_monitor_reader_promotion_canary_owner',
    'social_monitor_reader_promotion_canary_invoker');
SQL
psql "$admin" -v ON_ERROR_STOP=1 -f \
  "$REPO/ops/deploy/reader-promotion-v2-canary-control-bootstrap.sql" \
  >/dev/null

psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'f|t|f|f|f|f|f|2'
SELECT rolsuper, rolcanlogin, rolcreatedb, rolcreaterole, rolinherit,
  rolreplication, rolbypassrls, rolconnlimit
FROM pg_roles WHERE rolname = 'social_monitor_reader_promotion_canary_invoker';
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'f|f|f|f|f|f|f'
SELECT rolsuper, rolcanlogin, rolcreatedb, rolcreaterole, rolinherit,
  rolreplication, rolbypassrls
FROM pg_roles WHERE rolname = 'social_monitor_reader_promotion_canary_owner';
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'f'
SELECT bool_or(has_table_privilege(
  'social_monitor_reader_promotion_canary_invoker', table_name, privilege))
FROM unnest(ARRAY['public.tenants', 'public.reader_summaries',
  'public.reader_summary_publications', 'public.outbox_events',
  'public.delivery_attempts', 'public.notification_preferences']) table_name,
  unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE',
    'REFERENCES', 'TRIGGER']) privilege;
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx '0'
SELECT count(*) FROM pg_auth_members membership
JOIN pg_roles granted ON granted.oid = membership.roleid
JOIN pg_roles recipient ON recipient.oid = membership.member
WHERE granted.rolname LIKE 'social_monitor_reader_promotion_canary_%'
   OR recipient.rolname LIKE 'social_monitor_reader_promotion_canary_%';
SQL
expect_failure psql "$invoker" -c 'SELECT * FROM public.tenants' >/dev/null 2>&1
expect_failure psql "$invoker" -c \
  'SELECT * FROM reader_promotion_v2_canary_control.jobs' >/dev/null 2>&1

sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
manifest_digest=e48eb0033492835cc54f74d14ecdb9b69a8e7d75d71c3206410e2b3ef29577b3
schema_digest=b7ca379b6d8088dbf49009fa0e7ae37ed8a7d71b48d34b70ffb4d67409a774a1
request_digest=cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc
launcher=dd8a53daa1fe35b2f901bf2b2b000e0a02279bae45c963a631b85bbabbec891b
image_id=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
deadline=2026-09-04T12:03:00.000Z
binding=$(printf '%s' "{
  \"singletonId\":\"reader-promotion-v2-production-canary-v1\",
  \"ownerId\":\"run:1\",\"fence\":\"fence-one\",
  \"manifestSha256\":\"$manifest_digest\",
  \"schemaName\":\"social_monitor_reader_summary_story_relations\",
  \"schemaVersion\":\"reader_summary.story_relation.v1\",
  \"schemaSha256\":\"$schema_digest\",\"model\":\"gpt-5.6-sol\",
  \"reasoningEffort\":\"high\",\"canonicalRequestSha256\":\"$request_digest\",
  \"reconciliationDeadline\":\"$deadline\",
  \"protectedMainSha\":\"$sha\",\"deployedReleaseSha\":\"$sha\",
  \"deployedBackendSha\":\"$sha\",\"deployedControlSha\":\"$sha\",
  \"deployedRuntimeSha\":\"$sha\",\"runtimeImageId\":\"$image_id\",
  \"workflow\":\"reader-promotion-v2-production-canary\",
  \"workflowRunId\":\"100\",\"workflowRunAttempt\":1,
  \"runtimePackageVersion\":\"0.1.0-main.30\",
  \"runtimePackageSha256\":\"$request_digest\",\"launcherSha256\":\"$launcher\"
}")

psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$binding" <<'SQL' | grep -F 'OWNER|'
SELECT action, snapshot FROM reader_promotion_v2_canary_control.claim(
  :'binding'::jsonb);
SQL
binding=$(psql "$invoker" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT (reader_promotion_v2_canary_control.read()->'binding')::text;
SQL
)
mutable_image=$(node -e 'const value=JSON.parse(process.argv[1]);value.runtimeImageId="social-monitor-prod-daily-runner:latest";process.stdout.write(JSON.stringify(value))' "$binding")
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$mutable_image" \
  >/dev/null 2>&1 <<'SQL'
SELECT action FROM reader_promotion_v2_canary_control.claim(:'binding'::jsonb);
SQL
psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$binding" <<'SQL' | grep -F 'MODEL_RUNNING'
SELECT action, snapshot FROM reader_promotion_v2_canary_control.mark_model_running(
  :'binding'::jsonb);
SQL

# The invoker has no timestamp-taking procedure and cannot call owner-only
# deterministic implementations to bypass the database clock.
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$binding" >/dev/null 2>&1 <<'SQL'
SELECT * FROM reader_promotion_v2_canary_control.claim_at(
  :'binding'::jsonb, '2000-01-01T00:00:00Z');
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx '0'
SELECT count(*) FROM information_schema.routine_privileges
WHERE grantee = 'social_monitor_reader_promotion_canary_invoker'
  AND routine_schema = 'reader_promotion_v2_canary_control'
  AND routine_name LIKE '%\_at';
SQL

other=$(node -e 'const value=JSON.parse(process.argv[1]);value.ownerId="run:2";value.fence="fence-two";process.stdout.write(JSON.stringify(value))' "$binding")
psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$other" <<'SQL' | grep -F 'IN_PROGRESS|'
SELECT action, snapshot FROM reader_promotion_v2_canary_control.claim(
  :'binding'::jsonb);
SQL
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$other" >/dev/null 2>&1 <<'SQL'
SELECT snapshot FROM reader_promotion_v2_canary_control.complete_model(
  :'binding'::jsonb, 'RESPONSE', '{}'::jsonb,
  repeat('e', 64));
SQL

artifact=$(printf '%s' "{
  \"format\":\"reader-promotion-v2-production-canary-artifact.v1\",
  \"manifestSha256\":\"$manifest_digest\",\"schemaSha256\":\"$schema_digest\",
  \"canonicalRequestSha256\":\"$request_digest\",\"outputSha256\":\"$request_digest\",
  \"productAssertionsSha256\":\"$request_digest\",
  \"decisions\":[
    {\"leftFeedItemId\":\"cursor\",\"rightFeedItemId\":\"spacex\",\"sameStory\":true,\"confidenceScore\":0.99},
    {\"leftFeedItemId\":\"anthropic-watermark-x\",\"rightFeedItemId\":\"anthropic-watermark-reddit\",\"sameStory\":true,\"confidenceScore\":0.99},
    {\"leftFeedItemId\":\"claude-code-watermark\",\"rightFeedItemId\":\"claude-code-security\",\"sameStory\":false,\"confidenceScore\":0.99}
  ],
  \"usage\":{\"inputTokens\":11,\"outputTokens\":7,\"totalTokens\":18}
}")
canonical_digest() {
  node -e 'const c=v=>Array.isArray(v)?v.map(c):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,c(x)])):v;const h=require("node:crypto").createHash("sha256");process.stdout.write(h.update(JSON.stringify(c(JSON.parse(process.argv[1])))).digest("hex"))' "$1"
}
artifact_digest=$(canonical_digest "$artifact")
string_boolean=${artifact/\"sameStory\":true/\"sameStory\":\"true\"}
string_score=${artifact/\"confidenceScore\":0.99/\"confidenceScore\":\"0.99\"}
string_tokens=${artifact/\"inputTokens\":11/\"inputTokens\":\"11\"}
numeric_format=${artifact/\"format\":\"reader-promotion-v2-production-canary-artifact.v1\"/\"format\":1}
fractional_tokens=${artifact/\"inputTokens\":11/\"inputTokens\":11.5}
fractional_tokens=${fractional_tokens/\"totalTokens\":18/\"totalTokens\":18.5}
for malformed in "$string_boolean" "$string_score" "$string_tokens" \
    "$numeric_format" "$fractional_tokens"; do
  malformed_digest=$(canonical_digest "$malformed")
  expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$binding" \
    -v artifact="$malformed" -v artifact_digest="$malformed_digest" \
    >/dev/null 2>&1 <<'SQL'
SELECT snapshot FROM reader_promotion_v2_canary_control.complete_model(
  :'binding'::jsonb, 'RESPONSE', :'artifact'::jsonb, :'artifact_digest');
SQL
done
string_attempt=$(node -e 'const value=JSON.parse(process.argv[1]);value.workflowRunAttempt="1";process.stdout.write(JSON.stringify(value))' "$binding")
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$string_attempt" \
  >/dev/null 2>&1 <<'SQL'
SELECT action FROM reader_promotion_v2_canary_control.claim(:'binding'::jsonb);
SQL
artifact_with_extra_usage=${artifact/\"totalTokens\":18/\"totalTokens\":18,\"cachedTokens\":1}
extra_usage_digest=$(canonical_digest "$artifact_with_extra_usage")
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$binding" \
  -v artifact="$artifact_with_extra_usage" \
  -v artifact_digest="$extra_usage_digest" >/dev/null 2>&1 <<'SQL'
SELECT snapshot FROM reader_promotion_v2_canary_control.complete_model(
  :'binding'::jsonb, 'RESPONSE', :'artifact'::jsonb, :'artifact_digest');
SQL
psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$binding" \
  -v artifact="$artifact" -v artifact_digest="$artifact_digest" <<'SQL' | grep -F 'MODEL_COMPLETED'
SELECT snapshot FROM reader_promotion_v2_canary_control.complete_model(
  :'binding'::jsonb, 'RESPONSE', :'artifact'::jsonb, :'artifact_digest');
SQL

receipt=$(printf '%s' "{
  \"format\":\"reader-promotion-v2-production-canary-receipt.v1\",
  \"singletonId\":\"reader-promotion-v2-production-canary-v1\",
  \"state\":\"SUCCEEDED\",\"outcome\":\"RESPONSE\",
  \"protectedMainSha\":\"$sha\",\"deployedReleaseSha\":\"$sha\",
  \"deployedBackendSha\":\"$sha\",\"deployedControlSha\":\"$sha\",
  \"deployedRuntimeSha\":\"$sha\",\"runtimeImageId\":\"$image_id\",
  \"manifestSha256\":\"$manifest_digest\",
  \"schemaName\":\"social_monitor_reader_summary_story_relations\",
  \"schemaVersion\":\"reader_summary.story_relation.v1\",
  \"schemaSha256\":\"$schema_digest\",\"model\":\"gpt-5.6-sol\",
  \"reasoningEffort\":\"high\",\"canonicalRequestSha256\":\"$request_digest\",
  \"workflow\":\"reader-promotion-v2-production-canary\",\"workflowRunId\":\"100\",
  \"workflowRunAttempt\":1,\"fence\":\"fence-one\",
  \"runtimePackageVersion\":\"0.1.0-main.30\",
  \"runtimePackageSha256\":\"$request_digest\",\"launcherSha256\":\"$launcher\",
  \"artifactSha256\":\"$artifact_digest\",
  \"usage\":{\"inputTokens\":11,\"outputTokens\":7,\"totalTokens\":18},
  \"rejectionCode\":null
}")
receipt_digest=$(canonical_digest "$receipt")
receipt_string_attempt=${receipt/\"workflowRunAttempt\":1/\"workflowRunAttempt\":\"1\"}
receipt_string_tokens=${receipt/\"outputTokens\":7/\"outputTokens\":\"7\"}
for malformed in "$receipt_string_attempt" "$receipt_string_tokens"; do
  malformed_digest=$(canonical_digest "$malformed")
  expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$binding" \
    -v receipt="$malformed" -v receipt_digest="$malformed_digest" \
    >/dev/null 2>&1 <<'SQL'
SELECT snapshot FROM reader_promotion_v2_canary_control.finalize(
  :'binding'::jsonb, :'receipt'::jsonb, :'receipt_digest');
SQL
done
receipt_with_extra_usage=${receipt/\"totalTokens\":18/\"totalTokens\":18,\"cachedTokens\":1}
extra_receipt_digest=$(canonical_digest "$receipt_with_extra_usage")
expect_failure psql "$invoker" -v ON_ERROR_STOP=1 -v binding="$binding" \
  -v receipt="$receipt_with_extra_usage" \
  -v receipt_digest="$extra_receipt_digest" >/dev/null 2>&1 <<'SQL'
SELECT snapshot FROM reader_promotion_v2_canary_control.finalize(
  :'binding'::jsonb, :'receipt'::jsonb, :'receipt_digest');
SQL
psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$binding" \
  -v receipt="$receipt" -v receipt_digest="$receipt_digest" <<'SQL' | grep -F 'SUCCEEDED'
SELECT snapshot FROM reader_promotion_v2_canary_control.finalize(
  :'binding'::jsonb, :'receipt'::jsonb, :'receipt_digest');
SQL

psql "$invoker" -At -v ON_ERROR_STOP=1 -v binding="$other" <<'SQL' | grep -F 'TERMINAL|'
SELECT action, snapshot FROM reader_promotion_v2_canary_control.claim(
  :'binding'::jsonb);
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'CLAIMED,MODEL_RUNNING,MODEL_COMPLETED,SUCCEEDED'
SELECT string_agg(state, ',' ORDER BY occurred_at)
FROM reader_promotion_v2_canary_control.job_events;
SQL
for table in job_events artifacts receipts; do
  for mutation in \
    "UPDATE reader_promotion_v2_canary_control.$table SET singleton_id=singleton_id" \
    "DELETE FROM reader_promotion_v2_canary_control.$table" \
    "TRUNCATE reader_promotion_v2_canary_control.$table"; do
    expect_failure psql "$admin" -v ON_ERROR_STOP=1 -c "$mutation" >/dev/null 2>&1
  done
done
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx '0|0|0|0|0|0'
SELECT (SELECT count(*) FROM public.tenants),
  (SELECT count(*) FROM public.reader_summaries),
  (SELECT count(*) FROM public.reader_summary_publications),
  (SELECT count(*) FROM public.outbox_events),
  (SELECT count(*) FROM public.delivery_attempts),
  (SELECT count(*) FROM public.notification_preferences);
SQL
psql "$admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'jobs,job_events,artifacts,receipts'
SELECT string_agg(table_name, ',' ORDER BY CASE table_name
  WHEN 'jobs' THEN 1 WHEN 'job_events' THEN 2 WHEN 'artifacts' THEN 3 ELSE 4 END)
FROM information_schema.tables
WHERE table_schema = 'reader_promotion_v2_canary_control';
SQL
if psql "$admin" -At -c \
  "SELECT binding::text FROM reader_promotion_v2_canary_control.jobs UNION ALL SELECT artifact::text FROM reader_promotion_v2_canary_control.artifacts UNION ALL SELECT receipt::text FROM reader_promotion_v2_canary_control.receipts" |
  grep -Eqi 'systemPrompt|"prompt"|rationale|tenantId|workspaceId|access.?token|api.?key|bearer|provider.?exception|session'; then
  echo 'canary SQL evidence contains a forbidden field' >&2
  exit 1
fi
receipt_before=$(psql "$admin" -At -v ON_ERROR_STOP=1 -c \
  'SELECT receipt_sha256 FROM reader_promotion_v2_canary_control.receipts')
expect_failure psql "$admin" -v ON_ERROR_STOP=1 -f "$bootstrap" \
  >/dev/null 2>&1
[[ $(psql "$admin" -At -v ON_ERROR_STOP=1 -c \
  'SELECT receipt_sha256 FROM reader_promotion_v2_canary_control.receipts') == "$receipt_before" ]]

# A second disposable database proves the actual invoker's post-barrier crash
# transition atomically records MODEL_COMPLETED/UNCERTAIN then REJECTED.
psql "$server/postgres" -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE promotion_canary_expiry_test' >/dev/null
expiry_admin="$server/promotion_canary_expiry_test"
expiry_invoker="$invoker_server/promotion_canary_expiry_test"
psql "$expiry_admin" -v ON_ERROR_STOP=1 -f \
  "$REPO/ops/deploy/reader-promotion-v2-canary-control-bootstrap.sql" \
  >/dev/null
psql "$expiry_invoker" -At -v ON_ERROR_STOP=1 -v binding="$binding" <<'SQL' >/dev/null
SELECT action FROM reader_promotion_v2_canary_control.claim(
  :'binding'::jsonb);
SQL
expiry_binding=$(psql "$expiry_invoker" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT (reader_promotion_v2_canary_control.read()->'binding')::text;
SQL
)
psql "$expiry_invoker" -At -v ON_ERROR_STOP=1 \
  -v binding="$expiry_binding" <<'SQL' >/dev/null
SELECT snapshot FROM reader_promotion_v2_canary_control.mark_model_running(
  :'binding'::jsonb);
SELECT snapshot FROM reader_promotion_v2_canary_control.reject_uncertain(
  :'binding'::jsonb);
SQL
psql "$expiry_invoker" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -F '"state": "REJECTED"'
SELECT reader_promotion_v2_canary_control.read();
SQL
psql "$expiry_admin" -At -v ON_ERROR_STOP=1 <<'SQL' | grep -Fx 'CLAIMED:NULL,MODEL_RUNNING:NULL,MODEL_COMPLETED:UNCERTAIN,REJECTED:UNCERTAIN'
SELECT string_agg(state || ':' || COALESCE(outcome, 'NULL'), ','
  ORDER BY occurred_at)
FROM reader_promotion_v2_canary_control.job_events;
SQL

psql "$server/postgres" -v ON_ERROR_STOP=1 \
  -c 'CREATE DATABASE promotion_canary_race_test' >/dev/null
race_admin="$server/promotion_canary_race_test"
race_invoker="$invoker_server/promotion_canary_race_test"
psql "$race_admin" -v ON_ERROR_STOP=1 -f \
  "$REPO/ops/deploy/reader-promotion-v2-canary-control-bootstrap.sql" \
  >/dev/null
test_tmp=${CANARY_PG_TEST_TMP_ROOT:-${TMPDIR:-/tmp}}
race_one=$test_tmp/promotion-canary-race-one-$$
race_two=$test_tmp/promotion-canary-race-two-$$
race_claim() {
  local requested_binding=$1 output=$2
  psql "$race_invoker" -At -v ON_ERROR_STOP=1 \
    -v binding="$requested_binding" >"$output" <<'SQL'
SELECT action FROM reader_promotion_v2_canary_control.claim(
  :'binding'::jsonb);
SQL
}
race_claim "$binding" "$race_one" & first_pid=$!
race_claim "$other" "$race_two" & second_pid=$!
wait "$first_pid" "$second_pid"
[[ $(grep -hE '^(OWNER|IN_PROGRESS)$' "$race_one" "$race_two" | wc -l) == 2 ]]
[[ $(grep -h '^OWNER$' "$race_one" "$race_two" | wc -l) == 1 ]]
winner=$(psql "$race_invoker" -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT (reader_promotion_v2_canary_control.read()->'binding')::text;
SQL
)
race_mark() {
  local requested_binding=$1 output=$2
  psql "$race_invoker" -At -v ON_ERROR_STOP=1 \
    -v binding="$requested_binding" >"$output" <<'SQL'
SELECT action FROM reader_promotion_v2_canary_control.mark_model_running(
  :'binding'::jsonb);
SQL
}
race_mark "$winner" "$race_one" & first_pid=$!
race_mark "$winner" "$race_two" & second_pid=$!
wait "$first_pid" "$second_pid"
[[ $(grep -hE '^(ENTER|IN_PROGRESS)$' "$race_one" "$race_two" | wc -l) == 2 ]]
[[ $(grep -h '^ENTER$' "$race_one" "$race_two" | wc -l) == 1 ]]
rm -f "$race_one" "$race_two"

echo 'Reader Promotion V2 production canary PostgreSQL contract passed'
