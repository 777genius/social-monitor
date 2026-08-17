#!/usr/bin/env node
import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/pull-request.yml";
const workflow = readFileSync(workflowPath, "utf8");
const productionWorkflowPath = ".github/workflows/production-deploy.yml";
const productionWorkflow = readFileSync(productionWorkflowPath, "utf8");
const violations = [];

const findJob = (source, jobId) => source.match(
  new RegExp(
    `^  ${jobId}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_]*:|(?![\\s\\S]))`,
    "m",
  ),
)?.[1];

const requiredFragments = [
  "permissions:\n  contents: read",
  "concurrency:",
  "cancel-in-progress: true",
  "DATABASE_URL: postgresql://social_monitor_ci:",
  "static_quality:",
  "security_contracts:",
  "backend_unit:",
  "backend_e2e:",
  "postgres_rls:",
  "reader_summary_weekly_review_manifest_postgres18:",
  "production_runtime:",
  "frontend:",
  "npx eslint .",
  "npx tsc --noEmit",
  "npm run check:architecture",
  "npm run check:user-auth-boundary",
  "npm run check:tenant-rls-postgres",
  "npm run check:reader-summary-weekly-review-manifest-postgres18",
  "npm run check:container",
  "npm run check:runtime-compose",
  "npm run check:subscription-runtime-auth-pool-e2e",
  "npm run check:production-deploy-lifecycle",
  "npm run test:e2e",
  "flutter test app",
];

for (const fragment of requiredFragments) {
  if (!workflow.includes(fragment)) {
    violations.push(
      `${workflowPath}: missing required review gate "${fragment}"`,
    );
  }
}

for (const jobId of [
  "static_quality",
  "security_contracts",
  "backend_unit",
  "backend_e2e",
  "postgres_rls",
  "reader_summary_weekly_review_manifest_postgres18",
  "production_runtime",
  "frontend",
]) {
  const job = findJob(workflow, jobId);
  if (job === undefined || !/^\s{4}timeout-minutes: \d+$/m.test(job)) {
    violations.push(`${workflowPath}: ${jobId} must define timeout-minutes`);
  }
}

const weeklyReviewManifestJob = findJob(
  workflow,
  "reader_summary_weekly_review_manifest_postgres18",
);
for (const fragment of [
  "image: postgres:18.4-alpine",
  "POSTGRES_USER: social_monitor_weekly_review_manifest_ci_admin",
  "POSTGRES_PASSWORD: social_monitor_local_password",
  "POSTGRES_DB: social_monitor_weekly_review_manifest_ci_admin",
  "npm ci",
  "npm run prisma:generate",
  "DATABASE_URL: postgresql://social_monitor_weekly_review_manifest_ci_admin:social_monitor_local_password@127.0.0.1:5432/social_monitor_weekly_review_manifest_ci_admin",
  "READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL: postgresql://social_monitor_weekly_review_manifest_ci_admin:social_monitor_local_password@127.0.0.1:5432/social_monitor_weekly_review_manifest_ci_admin",
  "npm run check:reader-summary-weekly-review-manifest-postgres18",
]) {
  if (weeklyReviewManifestJob === undefined || !weeklyReviewManifestJob.includes(fragment)) {
    violations.push(
      `${workflowPath}: weekly review manifest PostgreSQL 18 job missing "${fragment}"`,
    );
  }
}

const readerSummaryPublicationJob = findJob(
  productionWorkflow,
  "verify_reader_summary_publication",
);
if (
  readerSummaryPublicationJob === undefined ||
  !readerSummaryPublicationJob.includes(
    "npm run check:reader-summary-weekly-review-manifest-postgres18",
  )
) {
  violations.push(
    `${productionWorkflowPath}: verify_reader_summary_publication must run the weekly review manifest PostgreSQL 18 contract`,
  );
}

if (
  !productionWorkflow.includes(
    "npm run check:subscription-runtime-auth-pool-e2e",
  )
) {
  violations.push(
    `${productionWorkflowPath}: production deploy must run the sandbox subscription-runtime auth-pool e2e`,
  );
}

for (const match of workflow.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s]+)$/gm)) {
  const action = match[1];
  const revision = match[2];
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    violations.push(
      `${workflowPath}: ${action} must be pinned to a full 40-character commit SHA`,
    );
  }
}

if (/^\s+[a-z-]+:\s+write\s*$/m.test(workflow)) {
  violations.push(
    `${workflowPath}: review workflow must not grant write permissions`,
  );
}

for (const prohibited of [
  "check:agent-quality-rules",
  "agent-runtime",
  "task-assignment",
  "terminal-runtime",
]) {
  if (workflow.includes(prohibited)) {
    violations.push(
      `${workflowPath}: prohibited real-project agent/runtime check "${prohibited}"`,
    );
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Pull request workflow contract OK");
