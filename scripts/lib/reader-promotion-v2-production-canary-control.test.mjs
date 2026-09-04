import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const workflow = read(".github/workflows/reader-promotion-v2-production-canary.yml");
const host = read("ops/deploy/production-runtime/reader-promotion-v2-production-canary.sh");
const migration = read(
  "prisma/migrations/20260904090000_reader_promotion_v2_production_canary_control/migration.sql",
);
const manifest = JSON.parse(read(
  "ops/release/reader-promotion-v2-production-canary.v1.json",
));
const runtimeContract = createRequire(import.meta.url)(
  "../../apps/agent-runtime/bin/reader-promotion-v2-canary-contract.cjs",
);
const canonical = (value) => JSON.stringify(Array.isArray(value)
  ? value.map((item) => JSON.parse(canonical(item)))
  : value !== null && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) =>
        a.localeCompare(b)).map(([key, item]) => [key, JSON.parse(canonical(item))]))
    : value);
const digest = (value) => createHash("sha256").update(canonical(value)).digest("hex");

test("manifest fixes the singleton model, timeout and exact relation batch", () => {
  assert.equal(manifest.singletonId,
    "reader-promotion-v2-production-canary-v1");
  assert.equal(manifest.model, "gpt-5.6-sol");
  assert.equal(manifest.reasoningEffort, "high");
  assert.ok(manifest.reconciliationDeadlineMs > manifest.providerTimeoutMs);
  assert.deepEqual(manifest.relationBatch.map((item) => [
    item.leftFeedItemId, item.rightFeedItemId, item.sameStory,
  ]), [
    ["cursor", "spacex", true],
    ["anthropic-watermark-x", "anthropic-watermark-reddit", true],
    ["claude-code-watermark", "claude-code-security", false],
  ]);
  assert.ok(migration.includes(digest(manifest)));
  assert.ok(migration.includes(digest(
    runtimeContract.readerPromotionV2CanaryOutputSchema,
  )));
});

test("manual workflow is protected-main exact-target and non-cancelling", () => {
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /\n  (push|pull_request|schedule):/);
  for (const exact of [
    '[[ "$GITHUB_REF" == "refs/heads/main" ]]',
    '[[ "$TARGET_SHA" == "$GITHUB_SHA" ]]',
    '[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]',
    '[[ "$CONFIRMATION" == "RUN-READER-PROMOTION-V2-CANARY-$GITHUB_SHA" ]]',
    "environment: production",
    "cancel-in-progress: false",
    "group: social-monitor-production",
    "permissions:\n  contents: read",
    "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10",
    "READER_PROMOTION_V2_CANARY_SSH_PRIVATE_KEY",
    "READER_PROMOTION_V2_CANARY_SSH_USER",
  ]) assert.ok(workflow.includes(exact), exact);
  assert.doesNotMatch(workflow,
    /systemctl|docker compose|\bservice\b|\bpublish\b|git push|restart/iu);
});

test("host reads official markers and never mutates a service", () => {
  for (const marker of [
    "rev-parse --verify 'HEAD^{commit}'", "deploy-state/backend.sha",
    "deploy-state/control.sha", "postgres-runtime-current/SOURCE_SHA",
  ]) assert.ok(host.includes(marker), marker);
  assert.match(host, /release == "\$target" && \$backend == "\$target"/);
  assert.match(host, /control == "\$target" && \$runtime == "\$target"/);
  assert.match(host, /run --rm --read-only --cap-drop ALL/);
  assert.ok(host.includes('flock_command" -s -w 3600 9'));
  assert.ok(host.includes("image inspect --format '{{.Id}}'"));
  assert.ok(host.includes('"$integration:/verified-checkout:ro"'));
  assert.ok(host.includes("--env NODE_PATH=/app/node_modules"));
  assert.ok(host.includes('"$image_id" node'));
  assert.ok(host.includes('--runtime-image-id "$image_id"'));
  assert.doesNotMatch(host,
    /social-monitor-prod-daily-runner:latest\s+\\?\s*node/);
  assert.doesNotMatch(host,
    /systemctl|compose (?:up|start|restart)|service (?:start|restart)|publish/iu);
});

test("migration is isolated, least privilege, immutable and procedure-only", () => {
  for (const required of [
    "NOLOGIN", "LOGIN", "NOINHERIT", "NOBYPASSRLS", "CONNECTION LIMIT 2",
    "REVOKE ALL ON SCHEMA", "FROM PUBLIC",
    "SET search_path = pg_catalog", "SECURITY DEFINER",
    "canary_events_immutable", "canary_artifacts_immutable",
    "canary_receipts_immutable", "BEFORE TRUNCATE",
    "MODEL_RUNNING", "MODEL_COMPLETED", "EXPLICIT_FAILURE", "UNCERTAIN",
  ]) assert.ok(migration.includes(required), required);
  assert.doesNotMatch(migration,
    /reader_summary_publications|outbox|delivery|notification|tenant_id|workspace_id/i);
  assert.deepEqual([...migration.matchAll(/CREATE TABLE [^(]+\.([a-z_]+)/g)]
    .map((match) => match[1]), ["jobs", "job_events", "artifacts", "receipts"]);
  assert.match(migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]+claim\(JSONB\)[\s\S]+read\(\)/);
  assert.doesNotMatch(migration,
    /GRANT EXECUTE ON FUNCTION[\s\S]+_at\([^;]+TO social_monitor_reader_promotion_canary_invoker/);
});

test("protected package stays untouched and pull-request CI uses exact gates", () => {
  const pullRequest = read(".github/workflows/pull-request.yml");
  for (const command of [
    "node --test scripts/lib/reader-promotion-v2-production-canary-control.test.mjs",
    "jest --config jest.config.ts --runInBand --runTestsByPath scripts/lib/reader-promotion-v2-production-canary-runner.spec.ts",
    "bash ops/deploy/production-runtime/reader-promotion-v2-production-canary.test.sh",
    "bash ops/deploy/reader-promotion-v2-production-canary-postgres.test.sh",
  ]) assert.ok(pullRequest.includes(command), command);
  assert.doesNotMatch(pullRequest,
    /npm run (?:check:reader-promotion-v2-production-canary(?:-postgres18)?|reader-summary:promotion-v2-production-canary)\b/);
});
