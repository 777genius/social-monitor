#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";

const workflowPath = ".github/workflows/pull-request.yml";
const workflow = readFileSync(workflowPath, "utf8");
const productionWorkflowPath = ".github/workflows/production-deploy.yml";
const productionWorkflow = readFileSync(productionWorkflowPath, "utf8");
const transitionAdmissionPath = ".github/workflows/production-transition-admission.yml";
const transitionReviewPath = ".github/workflows/production-transition-review.yml";
const transitionPublishPath = ".github/workflows/production-transition-publish.yml";
const transitionReview = readFileSync(transitionReviewPath, "utf8");
const transitionPublish = readFileSync(transitionPublishPath, "utf8");
const transitionClientPath = "ops/deploy/github-production-transition-client-lib.sh";
const transitionClient = readFileSync(transitionClientPath, "utf8");
const productionClientPath = "ops/deploy/github-production-deploy-client.sh";
const productionClient = readFileSync(productionClientPath, "utf8");
const productionForwardClient = readFileSync(
  "ops/deploy/github-production-forward-bridge-client-lib.sh",
  "utf8",
);
const forwardAuthoritySealPath =
  "ops/deploy/production-forward-bridge-authority.blobs";
const forwardAuthoritySeal = readFileSync(forwardAuthoritySealPath, "utf8");
const forwardBlobManifest = readFileSync(
  "ops/deploy/production-forward-bridge.blobs",
  "utf8",
);
const transitionProtectedPath = "ops/deploy/production-transition-protected.manifest";
const transitionProtected = readFileSync(transitionProtectedPath, "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const violations = [];
const subscriptionRuntimeAuthPoolE2eCommand =
  "node --test apps/agent-runtime/bin/codex-auth-pool-manifest.test.mjs apps/agent-runtime/bin/codex-auth-pool-routing.test.mjs apps/agent-runtime/bin/subscription-runtime-auth-pool.e2e.test.mjs apps/agent-runtime/bin/subscription-runtime-purpose-model-policy.test.mjs";
const dailyCursorPostgres18Command =
  "node scripts/run-with-timeout.mjs --timeout-ms 180000 --node-options --max-old-space-size=1024 -- ts-node -r tsconfig-paths/register scripts/check-reader-summary-daily-execution-cursor-postgres.ts";
const rollingReceiptTest =
  "node ops/deploy/production-runtime/rolling-summary-receipt.test.mjs";
const rollingRunTest =
  "bash ops/deploy/production-runtime/rolling-run.test.sh";
const transitionLifecycleTests = [
  "bash ops/deploy/github-production-transition-client-lib.test.sh",
  "bash ops/deploy/production-transition-admission.test.sh",
  "bash ops/deploy/production-transition-publisher-lifecycle.test.sh",
  "bash ops/deploy/production-transition-b0-bootstrap.test.sh",
  "bash ops/deploy/production-transition-b0-host-control.test.sh",
];
const forwardLifecycleTests = [
  "bash ops/deploy/production-forward-bootstrap-marker-resume.test.sh",
  "bash ops/deploy/production-forward-bridge.test.sh",
  "bash ops/deploy/github-production-deploy-client.test.sh",
  "bash ops/deploy/production-release-b-bridge-order.test.sh",
  "bash ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh",
];
const productionForwardShellcheckFiles = [
  "ops/deploy/social-monitor-production-deploy.sh",
  "ops/deploy/production-transition-b0-host-control.sh",
  "ops/deploy/production-transition-marker-lib.sh",
  "ops/deploy/production-forward-bridge-host-lib.sh",
  "ops/deploy/github-production-forward-bridge-client-lib.sh",
];
const productionForwardShellcheckCommand =
  `bash ops/deploy/verify-production-shellcheck-baseline.sh ${productionForwardShellcheckFiles.join(" ")}`;
const productionDeployLifecycle =
  packageJson.scripts?.["check:production-deploy-lifecycle"] ?? "";
const productionDeployLifecycleCommands =
  productionDeployLifecycle.split(" && ");

const forwardAuthorityPaths = [
  "ops/deploy/deploy-control-bridge-lib.sh",
  "ops/deploy/production-forward-bridge-host-lib.sh",
  "ops/deploy/production-forward-bridge.blobs",
  "ops/deploy/production-transition-b0-host-control.sh",
  "ops/deploy/production-transition-marker-lib.sh",
];
const expectedForwardAuthoritySeal = forwardAuthorityPaths.map((path) => {
  const blob = execFileSync("git", ["hash-object", "--no-filters", path], {
    encoding: "utf8",
  }).trim();
  return `100644 ${blob} ${path}`;
}).join("\n") + "\n";
const sealBlob = execFileSync(
  "git",
  ["hash-object", "--no-filters", forwardAuthoritySealPath],
  { encoding: "utf8" },
).trim();
if (
  forwardAuthoritySeal !== expectedForwardAuthoritySeal ||
  forwardBlobManifest.includes(forwardAuthoritySealPath) ||
  !productionForwardClient.includes(
    `PRODUCTION_FORWARD_AUTHORITY_SEAL_BLOB=${sealBlob}`,
  )
) {
  violations.push(
    `${forwardAuthoritySealPath}: must exactly seal the sorted B authority blobs, stay outside the B manifest, and be pinned by the client`,
  );
}
const sealCheckout = lstatSync(forwardAuthoritySealPath);
if (!sealCheckout.isFile() || sealCheckout.isSymbolicLink()) {
  violations.push(`${forwardAuthoritySealPath}: must be a regular checkout file`);
}

const protectedLines = transitionProtected.trimEnd().split("\n");
const protectedSpecs = protectedLines.slice(1);
const expectedProtectedSpecs = [
  "100644:.github/workflows/production-deploy.yml",
  "100644:.github/workflows/production-transition-publish.yml",
  "100644:.github/workflows/production-transition-review.yml",
  "100644:ops/deploy/deploy-control-lib.sh",
  "100755:ops/deploy/github-production-deploy-client.sh",
  "100644:ops/deploy/github-production-transition-client-lib.sh",
  "100755:ops/deploy/github-production-transition-client-lib.test.sh",
  "100644:ops/deploy/production-deploy-history-lib.sh",
  "100755:ops/deploy/production-transition-admission.sh",
  "100755:ops/deploy/production-transition-admission.test.sh",
  "100644:ops/deploy/production-transition-b0-host-control.sh",
  "100755:ops/deploy/production-transition-b0-host-control.test.sh",
  "100644:ops/deploy/production-transition-canonical-lib.sh",
  "100644:ops/deploy/production-transition-marker-lib.sh",
  "100644:ops/deploy/production-transition-protected.manifest",
  "100755:ops/deploy/production-transition-publisher-lifecycle.test.sh",
  "100755:ops/deploy/production-transition-publisher.sh",
  "100644:ops/deploy/production-transition-review-lib.sh",
  "100644:ops/deploy/production-transition-review.allowed_signers",
  "100644:ops/deploy/production-transition-review.anchor",
  "100755:ops/deploy/production-transition-reviewer.sh",
  "100755:ops/deploy/production-transition-reviewer.test.sh",
  "100755:ops/deploy/production-transition-runtime-resume.test.sh",
  "100644:ops/deploy/production-transition-target-lib.sh",
  "100644:ops/deploy/production-transition-target.allowed_signers",
  "100644:ops/deploy/production-transition-target.anchor",
  "100644:ops/deploy/social-monitor-production-deploy.sh",
  "100755:ops/deploy/social-monitor-production-deploy.test.sh",
  "100644:ops/deploy/social-monitor-production-ssh-wrapper.sh",
  "100755:ops/deploy/social-monitor-production-ssh-wrapper.test.sh",
];
const protectedPaths = protectedSpecs.map((line) => line.split(":", 2)[1]);
if (
  protectedLines[0] !==
    "version=social-monitor-production-transition-protected-paths-v1" ||
  protectedPaths.some((path) => path === undefined) ||
  protectedPaths.some((path, index) => index > 0 && protectedPaths[index - 1] >= path) ||
  new Set(protectedPaths).size !== protectedPaths.length ||
  protectedSpecs.join("\n") !== expectedProtectedSpecs.join("\n")
) {
  violations.push(
    `${transitionProtectedPath}: mode:path rows must equal the exact canonical frozen-control set`,
  );
}

for (const spec of expectedProtectedSpecs) {
  const [expectedMode, path] = spec.split(":", 2);
  let trackedEntry = "";
  try {
    trackedEntry = execFileSync("git", ["ls-files", "--stage", "--", path], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trimEnd();
  } catch {
    violations.push(`${transitionProtectedPath}: frozen control is not tracked: ${path}`);
    continue;
  }
  const trackedMatch = trackedEntry.match(/^(100644|100755) [0-9a-f]{40} 0\t(.+)$/u);
  if (
    trackedMatch === null ||
    trackedMatch[1] !== expectedMode ||
    trackedMatch[2] !== path
  ) {
    violations.push(
      `${transitionProtectedPath}: frozen control is not one regular tracked file with mode ${expectedMode}: ${path}`,
    );
    continue;
  }
  let checkout;
  try {
    checkout = lstatSync(path);
  } catch {
    violations.push(`${transitionProtectedPath}: frozen control is absent from checkout: ${path}`);
    continue;
  }
  if (!checkout.isFile() || checkout.isSymbolicLink()) {
    violations.push(`${transitionProtectedPath}: frozen control is not a regular checkout file: ${path}`);
    continue;
  }
  const checkoutMode = (checkout.mode & 0o111) === 0 ? "100644" : "100755";
  if (checkoutMode !== expectedMode) {
    violations.push(
      `${transitionProtectedPath}: frozen control mode differs for ${path}: expected ${expectedMode}, got ${checkoutMode}`,
    );
  }
}

for (const [path, source] of [
  ["ops/deploy/production-transition-canonical-lib.sh", readFileSync("ops/deploy/production-transition-canonical-lib.sh", "utf8")],
  ["ops/deploy/production-transition-admission.sh", readFileSync("ops/deploy/production-transition-admission.sh", "utf8")],
  ["ops/deploy/production-transition-b0-host-control.sh", readFileSync("ops/deploy/production-transition-b0-host-control.sh", "utf8")],
]) {
  if (
    !source.includes("production-transition-protected.manifest") &&
    !source.includes("production_transition_protected_manifest")
  ) {
    violations.push(`${path}: must consume the canonical protected path manifest`);
  }
}

try {
  lstatSync(transitionAdmissionPath);
  violations.push(
    `${transitionAdmissionPath}: circular target-controlled admission workflow must be absent`,
  );
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

for (const [path, source] of [
  [transitionClientPath, transitionClient],
  [productionClientPath, productionClient],
]) {
  for (const prohibited of [
    "admit-transition",
    "actions/workflows",
    "actions/runs",
    "workflow_runs",
    "production_transition_admission_dispatch",
    "production_transition_admit_via_protected_main",
  ]) {
    if (source.includes(prohibited)) {
      violations.push(`${path}: obsolete workflow-controlled admission remains: ${prohibited}`);
    }
  }
}
if (
  !transitionClient.includes("--method GET") ||
  transitionClient.includes("--method POST") ||
  !transitionClient.includes(
    '"repos/$PRODUCTION_TRANSITION_MAIN_REPOSITORY/git/ref/heads/$PRODUCTION_TRANSITION_MAIN_BRANCH"',
  ) ||
  !/observed_main=\$\(production_transition_observe_main_sha\)\n\s+\[\[ \$observed_main == "\$target" \]\] \|\|\n\s+fail 'protected main is not the exact published transition target'\n\s+run_remote deploy-transition "\$target"/u.test(
    transitionClient,
  ) ||
  transitionClient.match(/run_remote deploy-transition "\$target"/gu)?.length !== 1
) {
  violations.push(
    `${transitionClientPath}: activation must perform one read-only exact-main observation immediately before one trusted-host deploy-transition`,
  );
}
if (
  !transitionReview.includes("PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY") ||
  transitionReview.includes("PRODUCTION_TRANSITION_TARGET_SIGNING_KEY") ||
  !transitionPublish.includes("PRODUCTION_TRANSITION_TARGET_SIGNING_KEY") ||
  transitionPublish.includes("PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY") ||
  transitionReview.includes("PRODUCTION_TRANSITION_REVIEW_PRIVATE_KEY") ||
  transitionPublish.includes("PRODUCTION_TRANSITION_TARGET_PRIVATE_KEY")
) {
  violations.push("production transition workflows must keep review and target signing authorities separate");
}
for (const [path, source] of [
  [transitionReviewPath, transitionReview],
  [transitionPublishPath, transitionPublish],
]) {
  for (const match of source.matchAll(/^\s*uses:\s+([^@\s]+)@([^\s]+)$/gm)) {
    if (!/^[0-9a-f]{40}$/.test(match[2])) {
      violations.push(`${path}: ${match[1]} must be pinned to a full commit SHA`);
    }
  }
}

if (
  packageJson.scripts?.["check:subscription-runtime-auth-pool-e2e"] !==
  subscriptionRuntimeAuthPoolE2eCommand
) {
  violations.push(
    "package.json: subscription runtime auth-pool e2e must enumerate only the reviewed deterministic sandbox tests",
  );
}
for (const command of [rollingReceiptTest, rollingRunTest]) {
  if (
    !productionDeployLifecycleCommands.includes(command) ||
    !productionWorkflow.includes(command)
  ) {
    violations.push(
      `production rolling contract test must run in lifecycle script and workflow: ${command}`,
    );
  }
}
for (const command of transitionLifecycleTests) {
  const occurrences = productionDeployLifecycleCommands.filter(
    (candidate) => candidate === command,
  ).length;
  if (occurrences !== 1) {
    violations.push(
      `package.json: production transition lifecycle must contain exactly one exact command: ${command}`,
    );
  }
}
for (const command of forwardLifecycleTests) {
  const occurrences = productionDeployLifecycleCommands.filter(
    (candidate) => candidate === command,
  ).length;
  if (occurrences !== 1) {
    violations.push(
      `package.json: production forward lifecycle must contain exactly one exact command: ${command}`,
    );
  }
}
if (productionDeployLifecycleCommands[0] !== productionForwardShellcheckCommand) {
  violations.push(
    "package.json: production forward ShellCheck command must use the exact required authority inventory",
  );
}
const productionWorkflowShellcheckMatch = productionWorkflow.match(
  /^\s*deploy_shell_files=\(\n([\s\S]*?)^\s*\)\n/m,
);
const productionWorkflowShellcheckFiles =
  productionWorkflowShellcheckMatch?.[1].trim().split(/\s+/u) ?? [];
for (const shellAuthority of productionForwardShellcheckFiles.slice(1)) {
  if (!productionWorkflowShellcheckFiles.includes(shellAuthority)) {
    violations.push(
      `production forward shell authority must be in the production workflow ShellCheck inventory: ${shellAuthority}`,
    );
  }
}
if (
  packageJson.scripts?.["check:reader-summary-daily-execution-cursor-postgres18"] !==
  dailyCursorPostgres18Command
) {
  violations.push(
    "package.json: daily execution cursor PostgreSQL 18 checker must remain timeout-bounded and executable",
  );
}

const findJob = (source, jobId) => source.match(
  new RegExp(
    `^  ${jobId}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_]*:|(?![\\s\\S]))`,
    "m",
  ),
)?.[1];

const transitionPublisherJob = findJob(transitionPublish, "publish");
const transitionActivationJob = findJob(transitionPublish, "activate");

if (
  !transitionPublish.includes("\npermissions: {}\n") ||
  transitionPublisherJob === undefined ||
  !/^ {4}permissions:\n {6}actions: read\n {6}contents: write\n(?= {4}\S)/mu.test(
    transitionPublisherJob,
  ) ||
  !transitionPublisherJob.includes(
    "outputs:\n      target_sha: ${{ steps.publish_target.outputs.target_sha }}",
  ) ||
  !transitionPublisherJob.includes("id: publish_target") ||
  !/production-transition-publisher\.sh publish "\$target"\n\s+printf 'target_sha=%s\\n' "\$target" >> "\$GITHUB_OUTPUT"/u.test(
    transitionPublisherJob,
  ) ||
  transitionPublisherJob.match(
    /target_sha: \$\{\{ steps\.publish_target\.outputs\.target_sha \}\}/gu,
  )?.length !== 1 ||
  transitionPublisherJob.match(
    /printf 'target_sha=%s\\n' "\$target" >> "\$GITHUB_OUTPUT"/gu,
  )?.length !== 1
) {
  violations.push(
    `${transitionPublishPath}: publish must expose the one verified, atomically published target as its exact job output`,
  );
}

for (const prohibited of [
  "PRODUCTION_SSH_PRIVATE_KEY",
  "PRODUCTION_SSH_KNOWN_HOSTS",
  "DEPLOY_HOST:",
  "DEPLOY_USER:",
  "deploy-transition",
]) {
  if (transitionPublisherJob?.includes(prohibited)) {
    violations.push(
      `${transitionPublishPath}: publish job must not receive production activation authority: ${prohibited}`,
    );
  }
}
for (const [authority, token, owner] of [
  [
    "PRODUCTION_TRANSITION_TARGET_SIGNING_KEY",
    "PRODUCTION_TRANSITION_TARGET_SIGNING_KEY }}",
    transitionPublisherJob,
  ],
  ["PRODUCTION_SSH_PRIVATE_KEY", "PRODUCTION_SSH_PRIVATE_KEY", transitionActivationJob],
  ["PRODUCTION_SSH_KNOWN_HOSTS", "PRODUCTION_SSH_KNOWN_HOSTS", transitionActivationJob],
]) {
  if (
    transitionPublish.split(token).length !== 2 ||
    !owner?.includes(authority)
  ) {
    violations.push(
      `${transitionPublishPath}: ${authority} must be exposed exactly once and only to its authorized job`,
    );
  }
}

const transitionActivationRequired = [
  "needs: publish",
  "environment: production",
  "permissions:\n      contents: read",
  "ref: ${{ github.sha }}",
  "persist-credentials: false",
  "TARGET_SHA: ${{ needs.publish.outputs.target_sha }}",
  '[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]',
  '[[ "$(git rev-parse HEAD)" == "$GITHUB_SHA" ]]',
  "DEPLOY_KEY: ${{ secrets.PRODUCTION_SSH_PRIVATE_KEY }}",
  "KNOWN_HOSTS: ${{ secrets.PRODUCTION_SSH_KNOWN_HOSTS }}",
  "GH_TOKEN: ${{ github.token }}",
  "DEPLOY_HOST: ${{ vars.PRODUCTION_SSH_HOST }}",
  "DEPLOY_USER: ${{ vars.PRODUCTION_SSH_USER }}",
  "run: bash ops/deploy/github-production-deploy-client.sh configure",
];
for (const fragment of transitionActivationRequired) {
  if (!transitionActivationJob?.includes(fragment)) {
    violations.push(
      `${transitionPublishPath}: independently authorized activation job missing "${fragment}"`,
    );
  }
}
const transitionActivationOrder = [
  "ref: ${{ github.sha }}",
  '[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]',
  "run: bash ops/deploy/github-production-deploy-client.sh configure",
  'deploy-transition "$TARGET_SHA"',
  "if: always()",
].map((fragment) => transitionActivationJob?.indexOf(fragment) ?? -1);
if (
  transitionActivationJob === undefined ||
  !/^ {4}permissions:\n {6}contents: read\n(?= {4}\S)/mu.test(
    transitionActivationJob,
  ) ||
  /\n {6}[a-z-]+: write(?:\n|$)/u.test(transitionActivationJob) ||
  transitionActivationJob.includes("PRODUCTION_TRANSITION_TARGET_PRIVATE_KEY") ||
  transitionActivationJob.includes("PRODUCTION_TRANSITION_TARGET_SIGNING_KEY") ||
  transitionActivationJob.match(
    /\$\{\{ needs\.publish\.outputs\.target_sha \}\}/gu,
  )?.length !== 2 ||
  transitionActivationJob.match(
    /deploy-transition "\$TARGET_SHA"/gu,
  )?.length !== 1 ||
  transitionActivationJob.match(
    /run: bash ops\/deploy\/github-production-deploy-client\.sh configure/gu,
  )?.length !== 1 ||
  transitionActivationJob.match(
    /run: bash ops\/deploy\/github-production-deploy-client\.sh cleanup/gu,
  )?.length !== 1 ||
  transitionActivationJob.match(
    /uses: actions\/checkout@[0-9a-f]{40}/gu,
  )?.length !== 1 ||
  transitionActivationOrder.some(
    (position, index) =>
      position < 0 ||
      (index > 0 && position <= transitionActivationOrder[index - 1]),
  ) ||
  /github-production-deploy-client\.sh\s+deploy\s/u.test(
    transitionActivationJob,
  ) ||
  !/if: always\(\)\n\s+shell: bash\n\s+run: bash ops\/deploy\/github-production-deploy-client\.sh cleanup/u.test(
    transitionActivationJob,
  )
) {
  violations.push(
    `${transitionPublishPath}: activation must use frozen B0 code and read-only GitHub authority to invoke one exact deploy-transition, then always clean up SSH`,
  );
}

const requireScopedFlutterAppTests = (source, sourcePath) => {
  if (!/^\s*flutter test app\/test\s*$/mu.test(source)) {
    violations.push(
      `${sourcePath}: ordinary Flutter app tests must target app/test`,
    );
  }
  if (/^\s*flutter test app\s*$/mu.test(source)) {
    violations.push(
      `${sourcePath}: ordinary Flutter app tests must not discover app/test_driver or app/integration_test`,
    );
  }
};

requireScopedFlutterAppTests(workflow, workflowPath);
requireScopedFlutterAppTests(productionWorkflow, productionWorkflowPath);

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
  "npm run check:reader-summary-daily-execution-cursor-postgres18",
  "npm run check:reader-summary-weekly-review-manifest-postgres18",
  "npm run check:container",
  "npm run check:runtime-compose",
  "npm run check:subscription-runtime-auth-pool-e2e",
  "npm run check:production-deploy-lifecycle",
  "npm run test:e2e",
  "flutter test app/test",
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
  "npm run check:reader-summary-daily-execution-cursor-postgres18",
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
