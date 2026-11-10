import { isDeepStrictEqual } from "node:util";

// This reviewer-owned projection admits exactly one scope wrapper and retains
// the prior exhaustive backend, PG18, shell and release contract verifier.
const READY = "github.event_name != 'pull_request' || github.event.pull_request.draft == false";
const LIGHT = "needs.security_contracts.outputs.tier != 'full'";
const FULL_STEP = "needs.security_contracts.outputs.tier == 'full'";
const HEAVY = "(" + READY + ") && (github.event_name != 'pull_request' || " + FULL_STEP + ")";
const AGGREGATE_NEEDS = [
  "static_quality", "security_contracts", "frontend", "backend_unit_shards",
  "backend_build_contracts", "backend_e2e", "postgres_rls",
  "reader_promotion_v2_canary_postgres18", "feed_promotion_snapshot_postgres18",
  "reader_summary_weekly_review_manifest_postgres18", "reader_value_v3_postgres18",
  "production_candidate", "production_lifecycle", "production_runtime",
];
const HEAVY_JOBS = [
  "backend_build_contracts", "backend_e2e", "postgres_rls",
  "reader_promotion_v2_canary_postgres18", "feed_promotion_snapshot_postgres18",
  "reader_summary_weekly_review_manifest_postgres18", "reader_value_v3_postgres18",
];
const SELECT_SCRIPT = "set -euo pipefail\nif [[ \"$GITHUB_EVENT_NAME\" != pull_request ]]; then\n  echo \"tier=full\" >> \"$GITHUB_OUTPUT\"\n  exit 0\nfi\n# Changes to a stacked PR base may leave event base.sha stale.\n# Only use current base if it is part of the exact reviewed merge.\nif [[ \"$PR_BASE_REF\" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,199}$ ]] &&\n   [[ \"$PR_BASE_REF\" != *..* && \"$PR_BASE_REF\" != *//* ]] &&\n   git fetch --no-tags origin \"refs/heads/$PR_BASE_REF\" &&\n   CI_BASE_SHA=\"$(git rev-parse FETCH_HEAD)\" &&\n   [[ \"$CI_BASE_SHA\" =~ ^[a-f0-9]{40}$ ]] &&\n   git merge-base --is-ancestor \"$CI_BASE_SHA\" \"$GITHUB_SHA\" &&\n   git cat-file -e \"${CI_BASE_SHA}:scripts/ci/ci-impact.mjs\"; then\n  # Never execute untrusted PR-authored policy, tests or dependencies.\n  git show \"${CI_BASE_SHA}:scripts/ci/ci-impact.mjs\" > \"$RUNNER_TEMP/social-ci-impact-trusted.mjs\"\n  CI_BASE_SHA=\"$CI_BASE_SHA\" node \"$RUNNER_TEMP/social-ci-impact-trusted.mjs\"\nelse\n  echo \"CI impact: trusted current base not part of reviewed merge; full qualification\"\n  echo \"tier=full\" >> \"$GITHUB_OUTPUT\"\nfi";
const SCOPE_ONLY_SCRIPT = "set -euo pipefail\ncase \"${{ needs.security_contracts.outputs.tier }}\" in\n  docs|frontend) echo 'Backend shard intentionally not executed for narrowly classified PR' >> \"$GITHUB_STEP_SUMMARY\" ;;\n  *) echo '::error::unknown scope'; exit 1 ;;\nesac";
const AGGREGATE_GATE_SCRIPT = "set -euo pipefail\nassert_result() {\n  if [[ \"$2\" != \"$3\" ]]; then\n    echo \"::error::$1 got '$2'; expected '$3' for impact '$IMPACT_TIER'\"\n    exit 1\n  fi\n}\nassert_result impact \"$IMPACT_RESULT\" success\ncase \"$IMPACT_TIER\" in\n  docs|frontend|full) ;;\n  *) echo \"::error::unknown or missing CI impact tier: $IMPACT_TIER\"; exit 1 ;;\nesac\nif [[ \"$GITHUB_EVENT_NAME\" != pull_request ]]; then\n  assert_result main_or_merge_group \"$IMPACT_TIER\" full\nfi\nassert_result static \"$STATIC_RESULT\" success\nassert_result security \"$SECURITY_RESULT\" success\nexpected_heavy=skipped\n[[ \"$IMPACT_TIER\" == full ]] && expected_heavy=success\nexpected_frontend=skipped\n[[ \"$IMPACT_TIER\" != docs ]] && expected_frontend=success\nassert_result frontend \"$FRONTEND_RESULT\" \"$expected_frontend\"\nassert_result backend_unit_shards \"$BACKEND_UNIT_SHARDS_RESULT\" success\nassert_result backend_build_contracts \"$BACKEND_BUILD_CONTRACTS_RESULT\" \"$expected_heavy\"\nassert_result backend_e2e \"$BACKEND_E2E_RESULT\" \"$expected_heavy\"\nassert_result postgres_rls \"$POSTGRES_RLS_RESULT\" \"$expected_heavy\"\nassert_result reader_promotion_v2_canary_postgres18 \"$READER_PROMOTION_V2_CANARY_POSTGRES18_RESULT\" \"$expected_heavy\"\nassert_result feed_promotion_snapshot_postgres18 \"$FEED_PROMOTION_SNAPSHOT_POSTGRES18_RESULT\" \"$expected_heavy\"\nassert_result reader_summary_weekly_review_manifest_postgres18 \"$READER_SUMMARY_WEEKLY_REVIEW_MANIFEST_POSTGRES18_RESULT\" \"$expected_heavy\"\nassert_result reader_value_v3_postgres18 \"$READER_VALUE_V3_POSTGRES18_RESULT\" \"$expected_heavy\"\nassert_result production_candidate \"$PRODUCTION_CANDIDATE_RESULT\" success\nassert_result production_lifecycle \"$PRODUCTION_LIFECYCLE_RESULT\" success\nassert_result production_runtime \"$PRODUCTION_RUNTIME_RESULT\" success";

const checkoutAction = "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10";
const nodeAction = "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e";
const exactShell = (actual, expected) =>
  typeof actual === "string" && actual.trimEnd() === expected.trimEnd();
const exact = isDeepStrictEqual;

/**
 * Admit only the reviewed fail-closed CI impact wiring, then erase its
 * wrappers in a throwaway copy for the existing exact legacy CI contract.
 * Never mutate the actual parsed workflow or mark skipped test work as run.
 */
export function projectScopedBackendWorkflow(workflow) {
  const projected = globalThis.structuredClone(workflow);
  const jobs = workflow?.jobs;
  const errors = [];
  if (!jobs || typeof jobs !== "object") return { errors: ["impact: no jobs"], projected };
  const fail = (s) => errors.push("ci-impact: " + s);

  const security = jobs.security_contracts;
  const expectedSelector = {
    name: "Select fail-closed scope from reviewed trusted base",
    id: "select", shell: "bash", env: { PR_BASE_REF: "${{ github.base_ref }}" }, run: SELECT_SCRIPT + "\n",
  };
  if (!security || !exact(security.outputs, { tier: "${{ steps.select.outputs.tier }}" }) ||
      !Array.isArray(security.steps) || security.steps.length !== 6 ||
      !exact(security.steps[0], { name: "Check out the review commit", uses: checkoutAction,
        with: { "fetch-depth": 0, "persist-credentials": false } }) ||
      !exact(security.steps[2], expectedSelector)) {
    fail("required security job must select trusted scope before any PR dependencies");
  } else {
    const safe = projected.jobs.security_contracts;
    delete safe.outputs;
    safe.steps.splice(2, 1);
    delete safe.steps[0].with;
  }

  const shards = jobs.backend_unit_shards;
  if (!shards || !Array.isArray(shards.steps) || shards.steps.length !== 10) {
    fail("six-shard wrapper must contain a scope receipt and nine original steps");
  } else {
    const receipt = shards.steps[0];
    if (!exact(receipt, {
      name: "Record protected check as scope-exempt (no backend tests executed)",
      if: LIGHT, shell: "bash", run: SCOPE_ONLY_SCRIPT + "\n",
    })) fail("light shard must be a pure receipt; never count it as Jest");
    if (shards.needs !== "security_contracts" || shards.if !== READY)
      fail("protected six-shard jobs retain draft gate and trusted selector prerequisite");
    for (const step of shards.steps.slice(1)) {
      if (step.if !== FULL_STEP) fail("all original Jest/PG18/artifact steps must be full-only");
    }
    const p = projected.jobs.backend_unit_shards;
    delete p.needs;
    p.steps.shift();
    for (const step of p.steps) delete step.if;
  }

  for (const key of HEAVY_JOBS) {
    const item = jobs[key];
    if (!item || item.needs !== "security_contracts" || item.if !== HEAVY)
      fail(key + " requires exact full-only execution and trusted scope");
    if (projected.jobs[key]) {
      delete projected.jobs[key].needs;
      if (key === "backend_build_contracts") projected.jobs[key].if = READY;
    }
  }
  // Full-stack workflows preserve exact release/PG18 ownership; only Flutter
  // may skip ordinary docs, never auth/backend/shared sources.
  const flutter = jobs.frontend;
  if (!flutter || flutter.needs !== "security_contracts" ||
      flutter.if !== "github.event_name != 'pull_request' || needs.security_contracts.outputs.tier != 'docs'")
    fail("Flutter must run for frontend/full and every main push");
  if (projected.jobs.frontend) {
    delete projected.jobs.frontend.needs;
    delete projected.jobs.frontend.if;
  }

  const agg = jobs.backend_unit;
  const expectedEnv = {
    IMPACT_RESULT: "${{ needs.security_contracts.result }}",
    IMPACT_TIER: "${{ needs.security_contracts.outputs.tier }}",
    STATIC_RESULT: "${{ needs.static_quality.result }}",
    SECURITY_RESULT: "${{ needs.security_contracts.result }}",
    FRONTEND_RESULT: "${{ needs.frontend.result }}",
    BACKEND_UNIT_SHARDS_RESULT: "${{ needs.backend_unit_shards.result }}",
    BACKEND_BUILD_CONTRACTS_RESULT: "${{ needs.backend_build_contracts.result }}",
    BACKEND_E2E_RESULT: "${{ needs.backend_e2e.result }}",
    POSTGRES_RLS_RESULT: "${{ needs.postgres_rls.result }}",
    READER_PROMOTION_V2_CANARY_POSTGRES18_RESULT: "${{ needs.reader_promotion_v2_canary_postgres18.result }}",
    FEED_PROMOTION_SNAPSHOT_POSTGRES18_RESULT: "${{ needs.feed_promotion_snapshot_postgres18.result }}",
    READER_SUMMARY_WEEKLY_REVIEW_MANIFEST_POSTGRES18_RESULT: "${{ needs.reader_summary_weekly_review_manifest_postgres18.result }}",
    READER_VALUE_V3_POSTGRES18_RESULT: "${{ needs.reader_value_v3_postgres18.result }}",
    PRODUCTION_CANDIDATE_RESULT: "${{ needs.production_candidate.result }}",
    PRODUCTION_LIFECYCLE_RESULT: "${{ needs.production_lifecycle.result }}",
    PRODUCTION_RUNTIME_RESULT: "${{ needs.production_runtime.result }}",
  };
  if (!agg || !Array.isArray(agg.steps) || agg.steps.length !== 6 ||
      !exact(agg.needs, AGGREGATE_NEEDS) ||
      agg.if !== "always() && !cancelled() && (" + READY + ")") {
    fail("the protected aggregate must close the exact entire CI graph");
  } else {
    const first = agg.steps[0];
    if (!first || first.name !== "Enforce exact scope and all existing protected CI lanes" ||
        !exact(first.env, expectedEnv) || !exact(Object.keys(first).sort(), ["name", "env", "run"].sort()) ||
        !exactShell(first.run, AGGREGATE_GATE_SCRIPT)) {
      fail("aggregate must enforce all exact tier-dependent successes and expected skips");
    }
    for (const step of agg.steps.slice(1)) {
      if (step.if !== FULL_STEP) fail("all original completeness and artifact steps must run on full only");
    }
    const a = projected.jobs.backend_unit;
    a.needs = ["backend_unit_shards", "backend_build_contracts"];
    a.steps.shift();
    for (const step of a.steps) delete step.if;
  }
  return { errors, projected };
}
