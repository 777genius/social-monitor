#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load as loadYaml } from "js-yaml";
import { backendUnitShardingViolations, coverageWorkflowViolations } from "./ci/review-ci/backend-unit-contract.mjs";

export function releaseGateCiViolations(source) {
  let doc;
  try { doc = loadYaml(source); } catch { return ["invalid YAML for release controller gate"]; }
  const job = doc?.jobs?.static_quality;
  const steps = job?.steps;
  const fail = ["Static architecture and quality must run the system Python 3.12, hash-locked root controller gate on a disposable GitHub runner"];
  if (job?.name !== "Static architecture and quality" || job["runs-on"] !== "ubuntu-24.04" ||
      job.needs !== undefined || job.if !== undefined || job["continue-on-error"] !== undefined ||
      job.environment !== undefined || Object.keys(doc.env ?? {}).some((key) => key !== "DATABASE_URL") ||
      job.env !== undefined ||
      doc.defaults !== undefined || job.defaults !== undefined ||
      !Array.isArray(steps)) return fail;
  const setups = steps.filter((step) => step.uses?.startsWith("actions/setup-python@"));
  const gates = steps.filter((step) => step.run?.includes("ops/release/hetzner/check.sh"));
  const checkouts = steps.filter((step) => step.uses?.startsWith("actions/checkout@"));
  const checkout = checkouts[0];
  const gate = gates[0];
  if (setups.length !== 0 || gates.length !== 1 || checkouts.length !== 1 ||
      checkout.uses !== "actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10" ||
      checkout.env !== undefined || Object.keys(checkout.with ?? {}).length !== 2 ||
      checkout.with?.ref !== "${{ github.sha }}" || checkout.with?.["persist-credentials"] !== false ||
      Object.keys(gate.env ?? {}).length !== 1 ||
      gate.env?.RELEASE_GATE_VENV !== "${{ runner.temp }}/release-gate-venv" ||
      steps.indexOf(checkout) !== 0 || steps.indexOf(gate) !== 1 ||
      [checkout, gate].some((step) => step.if !== undefined || step["continue-on-error"] !== undefined ||
        step["working-directory"] !== undefined || (step.shell !== undefined && step.shell !== "bash")) ||
      /\$\{\{\s*secrets\./u.test(JSON.stringify({ env: doc.env, job }))) return fail;
  // Check resolved YAML command boundaries, accepting comments and indentation.
  // Ubuntu system Python matches the disposable chroot ABI; /root excludes runner-owned /opt.
  const commands = gate.run.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  const expected = [
    "set -euo pipefail",
    "test \"${GITHUB_ACTIONS:-}\" = true",
    "test \"${RUNNER_ENVIRONMENT:-}\" = github-hosted",
    "test \"$(id -u)\" -ne 0",
    "command -v shellcheck",
    "docker compose version",
    "docker pull postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722",
    "/usr/bin/python3.12 -m venv --copies \"$RELEASE_GATE_VENV\"",
    "\"$RELEASE_GATE_VENV/bin/python3\" -m pip install --require-hashes -r ops/release/hetzner/requirements.txt",
    "sudo test ! -e /root/social-monitor-release-contract-tests",
    "sudo mkdir -p /root/social-monitor-release-contract-tests/ops/release /root/social-monitor-release-contract-tests/node_modules",
    "sudo cp -R ops/release/hetzner /root/social-monitor-release-contract-tests/ops/release/",
    "sudo cp -R \"$RELEASE_GATE_VENV\" /root/social-monitor-release-contract-tests/python",
    "sudo env PATH=\"/root/social-monitor-release-contract-tests/python/bin:$PATH\" bash /root/social-monitor-release-contract-tests/ops/release/hetzner/check.sh",
  ];
  return commands.length === expected.length && commands.every((line, index) => line === expected[index]) ? [] : fail;
}

export function runReviewCi() {
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
violations.push(...releaseGateCiViolations(workflow));
const subscriptionRuntimeAuthPoolE2eCommand =
  "node --test --test-concurrency=1 apps/agent-runtime/bin/codex-auth-pool-manifest.test.mjs apps/agent-runtime/bin/codex-auth-pool-routing.test.mjs apps/agent-runtime/bin/subscription-runtime-auth-pool.e2e.test.mjs apps/agent-runtime/bin/subscription-runtime-purpose-model-policy.test.mjs apps/agent-runtime/bin/subscription-runtime-failure-details.test.mjs apps/agent-runtime/bin/pinned-codex-native-binary.test.mjs apps/agent-runtime/src/source-content-assessment-pool.test.mjs";
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
  !transitionReview.includes(
    "secrets.PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY",
  ) ||
  transitionReview.includes("PRODUCTION_TRANSITION_TARGET_SIGNING_KEY") ||
  !transitionPublish.includes(
    "secrets.PRODUCTION_TRANSITION_TARGET_SIGNING_KEY",
  ) ||
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

const pairedSelectorCommandViolations = (scripts) =>
  scripts?.["check:reader-paired-experiment"] ===
  "node scripts/run-with-timeout.mjs --timeout-ms 180000 --node-options --max-old-space-size=1536 -- node --test --test-concurrency=1 scripts/evals/reader-paired-experiment/*.test.cjs"
    ? [] : ["package.json: paired selector tests must remain serial, heap- and timeout-bounded with the full CJS inventory"];
violations.push(...pairedSelectorCommandViolations(packageJson.scripts));

const findJob = (source, jobId) => source.match(
  new RegExp(
    `^  ${jobId}:\\n([\\s\\S]*?)(?=^  [a-z][a-z0-9_]*:|(?![\\s\\S]))`,
    "m",
  ),
)?.[1];

violations.push(...backendUnitShardingViolations(workflow));
violations.push(...coverageWorkflowViolations(readFileSync(".github/workflows/coverage.yml", "utf8")));

const transitionReviewJob = findJob(transitionReview, "review");
const transitionPublisherJob = findJob(transitionPublish, "publish");
const transitionActivationJob = findJob(transitionPublish, "activate");

if (
  transitionReviewJob === undefined ||
  !transitionReviewJob.includes("environment: production") ||
  !transitionReviewJob.includes(
    "REVIEW_PRIVATE_KEY: ${{ secrets.PRODUCTION_TRANSITION_REVIEW_SIGNING_KEY }}",
  ) ||
  !transitionReviewJob.includes(
    "git config user.name 'social-monitor-transition-review'",
  ) ||
  !transitionReviewJob.includes(
    "git config user.email 'social-monitor-transition-review@users.noreply.github.com'",
  )
) {
  violations.push(
    `${transitionReviewPath}: review must receive only its production signing secret and configure deterministic commit identity`,
  );
}

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
if (
  !transitionPublisherJob?.includes("environment: production") ||
  !transitionPublisherJob.includes(
    "git config user.name 'social-monitor-transition-publisher'",
  ) ||
  !transitionPublisherJob.includes(
    "git config user.email 'social-monitor-transition-publisher@users.noreply.github.com'",
  )
) {
  violations.push(
    `${transitionPublishPath}: publisher must receive its production signing secret and configure deterministic commit identity`,
  );
}
for (const [authority, token, owner] of [
  [
    "PRODUCTION_TRANSITION_TARGET_SIGNING_KEY",
    "TARGET_PRIVATE_KEY: ${{ secrets.PRODUCTION_TRANSITION_TARGET_SIGNING_KEY }}",
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

// Parse the Flutter stanza semantically; retain the stable version-file contract.
const flutterCacheViolations = (source) => {
  let doc;
  try { doc = loadYaml(source); } catch { return ["invalid Flutter workflow YAML"]; }
  const steps = doc?.jobs?.frontend?.steps;
  if (!Array.isArray(steps)) return ["missing Flutter steps"];
  const setups = steps.filter((step) => typeof step?.uses === "string" && step.uses.startsWith("subosito/flutter-action@"));
  const versions = steps.filter((step) => step?.id === "flutter_version");
  const setup = setups[0];
  const version = versions[0];
  const expectedSuffix = "${{ runner.os }}-${{ runner.arch }}-${{ steps.flutter_version.outputs.version }}-${{ hashFiles('apps/frontend/**/pubspec.lock') }}";
  const expectedRun = [
    "node <<'NODE'",
    "const fs = require('node:fs');",
    "const version = JSON.parse(fs.readFileSync('apps/frontend/.fvmrc', 'utf8')).flutter;",
    "if (!/^\\d+\\.\\d+\\.\\d+$/.test(version)) throw new Error('Flutter must have an exact stable SDK version');",
    "fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\\n`);",
    "NODE",
  ].join("\n");
  if (setups.length !== 1 || versions.length !== 1 || steps.indexOf(version) >= steps.indexOf(setup) ||
      setup.uses !== "subosito/flutter-action@1a449444c387b1966244ae4d4f8c696479add0b2" ||
      setup.if !== undefined || setup["continue-on-error"] !== undefined ||
      version.if !== undefined || version["continue-on-error"] !== undefined ||
      typeof version.run !== "string" || version.run.trim() !== expectedRun || version["working-directory"] !== undefined ||
      setup.with?.channel !== "stable" || setup.with?.["flutter-version-file"] !== "apps/frontend/.fvmrc" ||
      setup.with?.["flutter-version"] !== undefined || setup.with?.cache !== true || setup.with?.["pub-cache"] !== true ||
      setup.with?.["cache-key"] !== `flutter-sdk-${expectedSuffix}` ||
      setup.with?.["pub-cache-key"] !== `flutter-pub-${expectedSuffix}` ||
      setup.with?.["cache-path"] !== undefined || setup.with?.["pub-cache-path"] !== undefined) {
    return ["Flutter cache must use the pinned stable SDK, exact resolved version, OS/architecture and all frontend lockfiles"];
  }
  return [];
};
violations.push(...flutterCacheViolations(workflow));

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
  "node --test scripts/ci/*.test.mjs",
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
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) runReviewCi();
