import { createStagingReliabilitySchemaValidation } from "./lib/staging-reliability-schema-validation.mjs";
import { createHash } from "node:crypto";
import { createStagingReliabilityCapturePathSmokes } from "./lib/staging-reliability-capture-path-smokes.mjs";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceArtifactProvenance } from './lib/evidence-provenance.mjs';
import { readPrivateEvidenceJsonFile } from "./lib/evidence-env-file.mjs";
import { createStagingReliabilityArtifactGuards } from "./lib/staging-reliability-artifact-guards.mjs";
import {
  requiredSignalIds,
  requiredEvidenceShapeBySignalId,
} from './lib/staging-reliability-required-evidence-schemas.mjs';
import {
  validateSignalResults,
  validateSignalEvidenceSchemaMap,
  validateArtifactTimeWindow,
} from "./lib/staging-reliability-signal-policy.mjs";
import {
  matchesEvidenceType,
  isRecord,
} from "./lib/staging-reliability-evidence-shape.mjs";

import { createStagingReliabilityReleaseWiringPolicy } from "./lib/staging-reliability-release-wiring-policy.mjs";

const evidencePath = "ops/drills/staging-reliability-evidence.json";
const packagePath = "package.json";
const backendSafePath = "ops/release/backend-safe-verify-contract.json";
const releaseContractPath = "ops/release/mvp-release-evidence-contract.json";
const backendOpsPath = "ops/release/backend-ops-readiness-contract.json";
const externalReadinessPath =
  "ops/release/external-beta-readiness-contract.json";
const baselinePath = "ops/release/release-baseline-contract.json";
const dockerStagingReliabilityCapturePath =
  "scripts/capture-docker-staging-reliability-evidence.mjs";
const dockerDurableBackendE2eCapturePath =
  "scripts/capture-docker-durable-backend-e2e-loop.mjs";
const durableBackendE2eCapturePath =
  "scripts/capture-durable-backend-e2e-loop.ts";
const currentScriptPath = fileURLToPath(import.meta.url);
const backendStagingEvidenceBundlePath =
  process.env.BACKEND_STAGING_EVIDENCE_BUNDLE_PATH?.trim();

const evidence = readJson(evidencePath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];
const {
  validateRealArtifactIdentity,
  validateNoRealArtifactFixtureMarkers,
  validateRedaction,
  validateNoSensitiveArtifactContent,
  isHttpUrlWithoutCredentials,
} = createStagingReliabilityArtifactGuards(violations);

const gateScript = "check:staging-reliability-evidence";
const gateCommand = `npm run ${gateScript}`;
const gateId = "staging-reliability-evidence";
const stagingArtifactFormat = "staging-reliability-artifact-v1";
const stagingArtifactEvidenceKind = "staging_drill";
const allowedStatuses = new Set(["pending_staging_evidence", "passed"]);
const requiredArtifactIds = new Set([
  "rabbitmq-staging-drill-output",
  "postgres-restore-drill-output",
  "durable-backend-e2e-output",
]);
const requiredEnvArtifacts = new Map([
  [
    "rabbitmq-staging-drill-output",
    {
      envVar: "RABBITMQ_STAGING_DRILL_ARTIFACT_PATH",
      requiredEnv: ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST"],
    },
  ],
  [
    "postgres-restore-drill-output",
    {
      envVar: "POSTGRES_RESTORE_DRILL_ARTIFACT_PATH",
      requiredEnv: ["STAGING_ENVIRONMENT_ID", "BACKEND_IMAGE_DIGEST"],
    },
  ],
  [
    "durable-backend-e2e-output",
    {
      envVar: "DURABLE_BACKEND_E2E_ARTIFACT_PATH",
      requiredEnv: [
        "STAGING_ENVIRONMENT_ID",
        "BACKEND_IMAGE_DIGEST",
        "API_BASE_URL",
      ],
    },
  ],
]);
const requiredDomains = new Set([
  "rabbitmq",
  "postgres",
  "durable-backend-e2e",
]);
const requiredExternalGroups = [
  "rabbitmq-staging-reliability-drill",
  "postgres-restore-migration-drill",
  "durable-backend-e2e-loop",
];
const requiredBackendOpsDomains = [
  "rabbitmq-reliability",
  "postgres-reliability",
  "observability-and-drills",
  "mvp-loop",
];
const signalPolicyContext = {
  violations,
  evidencePath,
  requiredSignalIds,
  requiredEvidenceShapeBySignalId,
};
const { validatePassedArtifactContentSchema } = createStagingReliabilitySchemaValidation({
  evidence,
  violations,
  evidencePath,
  stagingArtifactFormat,
  stagingArtifactEvidenceKind,
  requiredEnvArtifacts,
  isRecord,
  existsSync,
});

const {
  requireReleaseWiring,
  requireBackendOpsWiring,
  requireExternalReadinessWiring,
  requireBaselineWiring,
} = createStagingReliabilityReleaseWiringPolicy({
  violations,
  releaseContract,
  releaseContractPath,
  gateId,
  gateCommand,
  gateScript,
  backendOps,
  backendOpsPath,
  requiredBackendOpsDomains,
  evidencePath,
  externalReadiness,
  externalReadinessPath,
  requiredExternalGroups,
  baseline,
  baselinePath,
  evidence,
});

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== "backend-only") {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== "deferred_contract_only") {
  violations.push(
    `${evidencePath}: frontendPolicy must keep frontend deferred`,
  );
}

if (
  evidence.externalBetaStatus !== "hold_until_real_staging_drill_output" &&
  evidence.externalBetaStatus !== "passed"
) {
  violations.push(
    `${evidencePath}: externalBetaStatus must be hold_until_real_staging_drill_output or passed`,
  );
}

if (evidence.goRequiresAllSignalsPassed !== true) {
  violations.push(`${evidencePath}: goRequiresAllSignalsPassed must be true`);
}

validatePassedArtifactContentSchema();
validateSignalEvidenceSchemaMap(signalPolicyContext);

const artifactById = new Map();
for (const artifact of evidence.stagingEvidenceArtifacts ?? []) {
  if (artifactById.has(artifact.artifactId)) {
    violations.push(
      `${evidencePath}: duplicate staging artifact "${artifact.artifactId}"`,
    );
  }
  artifactById.set(artifact.artifactId, artifact);

  if (!requiredArtifactIds.has(artifact.artifactId)) {
    violations.push(
      `${evidencePath}: unsupported staging artifact "${artifact.artifactId}"`,
    );
  }
  if (!allowedStatuses.has(artifact.status)) {
    violations.push(
      `${evidencePath}: artifact "${artifact.artifactId}" has unsupported status "${artifact.status}"`,
    );
  }
  if (artifact.requiredForExternalBeta !== true) {
    violations.push(
      `${evidencePath}: artifact "${artifact.artifactId}" must be required for external beta`,
    );
  }

  if (artifact.status === "pending_staging_evidence") {
    for (const field of [
      "path",
      "sha256",
      "environmentId",
      "imageDigest",
      "operator",
      "startedAt",
      "completedAt",
    ]) {
      if (artifact[field] !== null) {
        violations.push(
          `${evidencePath}: pending artifact "${artifact.artifactId}" must keep ${field}=null`,
        );
      }
    }
  } else {
    requirePassedArtifact(artifact);
  }
}

for (const artifactId of requiredArtifactIds) {
  if (!artifactById.has(artifactId)) {
    violations.push(
      `${evidencePath}: missing staging artifact "${artifactId}"`,
    );
  }
}

const signalIds = new Set();
const signalsByArtifactId = new Map();
let hasPendingSignal = false;
for (const signal of evidence.requiredSignals ?? []) {
  if (signalIds.has(signal.signalId)) {
    violations.push(`${evidencePath}: duplicate signal "${signal.signalId}"`);
  }
  signalIds.add(signal.signalId);
  const artifactSignals =
    signalsByArtifactId.get(signal.stagingArtifactId) ?? [];
  artifactSignals.push(signal);
  signalsByArtifactId.set(signal.stagingArtifactId, artifactSignals);

  if (!requiredSignalIds.has(signal.signalId)) {
    violations.push(`${evidencePath}: unsupported signal "${signal.signalId}"`);
  }
  if (!requiredDomains.has(signal.domain)) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" has unsupported domain "${signal.domain}"`,
    );
  }
  if (!allowedStatuses.has(signal.status)) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" has unsupported status "${signal.status}"`,
    );
  }
  if (signal.requiredForExternalBeta !== true) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" must be required for external beta`,
    );
  }
  if (signal.status !== "passed") {
    hasPendingSignal = true;
  }

  const scriptName = String(signal.verificationCommand ?? "").replace(
    /^npm run /,
    "",
  );
  if (!scripts[scriptName]) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" references missing script "${scriptName}"`,
    );
  }
  if (!existsSync(signal.contractArtifact ?? "")) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" references missing contract artifact "${signal.contractArtifact}"`,
    );
  }
  if (!artifactById.has(signal.stagingArtifactId)) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" references unknown stagingArtifactId "${signal.stagingArtifactId}"`,
    );
  }
  if (
    typeof signal.requiredSignal !== "string" ||
    signal.requiredSignal.trim().length === 0
  ) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" must define requiredSignal`,
    );
  }
  if (
    typeof signal.exitCondition !== "string" ||
    signal.exitCondition.trim().length === 0
  ) {
    violations.push(
      `${evidencePath}: signal "${signal.signalId}" must define exitCondition`,
    );
  }

  const artifact = artifactById.get(signal.stagingArtifactId);
  if (signal.status === "passed" && artifact?.status !== "passed") {
    violations.push(
      `${evidencePath}: passed signal "${signal.signalId}" requires passed artifact "${signal.stagingArtifactId}"`,
    );
  }
}

for (const signalId of requiredSignalIds) {
  if (!signalIds.has(signalId)) {
    violations.push(`${evidencePath}: missing signal "${signalId}"`);
  }
}

validateExampleArtifactFixtures(signalsByArtifactId);
validateEnvironmentArtifacts(signalsByArtifactId);

for (const [artifactId, signals] of signalsByArtifactId.entries()) {
  const artifact = artifactById.get(artifactId);
  if (artifact === undefined || artifact.status !== "passed") {
    continue;
  }

  const pendingSignals = signals
    .filter((signal) => signal.status !== "passed")
    .map((signal) => signal.signalId);
  if (pendingSignals.length > 0) {
    violations.push(
      `${evidencePath}: passed artifact "${artifactId}" requires passed signals ${pendingSignals.join(", ")}`,
    );
  }

  validatePassedArtifactContent(artifact, signals);
}

if (evidence.externalBetaStatus === "passed" && hasPendingSignal) {
  violations.push(
    `${evidencePath}: externalBetaStatus cannot be passed while staging signals are pending`,
  );
}

requirePackageWiring();
requireReleaseWiring();
requireBackendOpsWiring();
requireExternalReadinessWiring();
requireBaselineWiring();
requireCaptureScriptWiring();
const { validateCaptureOutputPathGuards } = createStagingReliabilityCapturePathSmokes({
  violations, execFileSync, process, existsSync, resolve,
  dockerStagingReliabilityCapturePath, dockerDurableBackendE2eCapturePath,
});
validateCaptureOutputPathGuards();
validateDirectArtifactPathGuards();

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Staging reliability evidence contract OK");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}



function requirePassedArtifact(artifact) {
  if (
    typeof artifact.path !== "string" ||
    artifact.path.trim().length === 0 ||
    !existsSync(artifact.path)
  ) {
    violations.push(
      `${evidencePath}: passed artifact "${artifact.artifactId}" must reference an existing path`,
    );
    return;
  }

  const digest = createHash("sha256")
    .update(readFileSync(artifact.path))
    .digest("hex");
  if (artifact.sha256 !== digest) {
    violations.push(
      `${evidencePath}: passed artifact "${artifact.artifactId}" sha256 must match ${artifact.path}`,
    );
  }

  for (const field of [
    "environmentId",
    "operator",
    "startedAt",
    "completedAt",
  ]) {
    if (
      typeof artifact[field] !== "string" ||
      artifact[field].trim().length === 0
    ) {
      violations.push(
        `${evidencePath}: passed artifact "${artifact.artifactId}" must define ${field}`,
      );
    }
  }

  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ""))) {
    violations.push(
      `${evidencePath}: passed artifact "${artifact.artifactId}" must define immutable imageDigest`,
    );
  }
  validateRealArtifactIdentity(
    artifact,
    `${evidencePath}: stagingEvidenceArtifacts.${artifact.artifactId}`,
  );
}

function validatePassedArtifactContent(artifact, signals) {
  const content = readArtifactContent(artifact);
  if (content === undefined) {
    return;
  }

  validateArtifactContentEnvelope(content, artifact.path, artifact.artifactId);
  validateRealArtifactIdentity(content, artifact.path);
  validateArtifactProvenance(content.provenance, artifact.path, {
    allowFixture: false,
  });
  validateNoRealArtifactFixtureMarkers(content, artifact.path);
  for (const field of [
    "artifactId",
    "environmentId",
    "imageDigest",
    "operator",
    "startedAt",
    "completedAt",
  ]) {
    if (content[field] !== artifact[field]) {
      violations.push(
        `${artifact.path}: ${field} must match ${evidencePath} artifact metadata`,
      );
    }
  }

  validateRedaction(content, artifact.path);
  validateSignalResults(content, artifact, signals, signalPolicyContext);
}

function validateExampleArtifactFixtures(signalsByArtifactId) {
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (
    typeof examplePath !== "string" ||
    examplePath.trim().length === 0 ||
    !existsSync(examplePath)
  ) {
    return;
  }

  const fixture = readJson(examplePath);
  if (fixture.schemaVersion !== 1) {
    violations.push(`${examplePath}: schemaVersion must be 1`);
  }
  if (fixture.fixtureOnly !== true) {
    violations.push(`${examplePath}: fixtureOnly must be true`);
  }
  if (!Array.isArray(fixture.examples)) {
    violations.push(`${examplePath}: examples must be an array`);
    return;
  }

  const examplesByArtifactId = new Map();
  for (const example of fixture.examples) {
    if (!isRecord(example)) {
      violations.push(`${examplePath}: every example must be an object`);
      continue;
    }
    if (examplesByArtifactId.has(example.artifactId)) {
      violations.push(
        `${examplePath}: duplicate example artifactId "${example.artifactId}"`,
      );
    }
    examplesByArtifactId.set(example.artifactId, example);
  }

  for (const artifactId of requiredArtifactIds) {
    const example = examplesByArtifactId.get(artifactId);
    if (example === undefined) {
      violations.push(`${examplePath}: missing example for "${artifactId}"`);
      continue;
    }

    const artifactLabel = `${examplePath}#${artifactId}`;
    validateArtifactContentEnvelope(example, artifactLabel, artifactId);
    validateArtifactProvenance(example.provenance, artifactLabel, {
      allowFixture: true,
    });
    validateRedaction(example, artifactLabel);
    validateSignalResults(
      example,
      {
        artifactId,
        path: artifactLabel,
        startedAt: example.startedAt,
        completedAt: example.completedAt,
      },
      signalsByArtifactId.get(artifactId) ?? [],
      signalPolicyContext,
    );
  }
}

function validateArtifactContentEnvelope(content, artifactPath, artifactId) {
  if (content.schemaVersion !== 1) {
    violations.push(`${artifactPath}: schemaVersion must be 1`);
  }
  if (content.format !== stagingArtifactFormat) {
    violations.push(`${artifactPath}: format must be ${stagingArtifactFormat}`);
  }
  if (content.artifactId !== artifactId) {
    violations.push(`${artifactPath}: artifactId must be ${artifactId}`);
  }
  if (
    typeof content.environmentId !== "string" ||
    content.environmentId.trim().length === 0
  ) {
    violations.push(`${artifactPath}: environmentId must be non-empty`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(content.imageDigest ?? ""))) {
    violations.push(
      `${artifactPath}: imageDigest must be immutable sha256:<64 hex chars>`,
    );
  }
  for (const field of ["operator", "startedAt", "completedAt"]) {
    if (
      typeof content[field] !== "string" ||
      content[field].trim().length === 0
    ) {
      violations.push(`${artifactPath}: ${field} must be non-empty`);
    }
  }
  for (const field of ["startedAt", "completedAt"]) {
    if (!matchesEvidenceType(content[field], "iso_timestamp")) {
      violations.push(`${artifactPath}: ${field} must be an ISO timestamp`);
    }
  }
  validateArtifactTimeWindow(content, artifactPath, signalPolicyContext);
}

function validateArtifactProvenance(provenance, artifactPath, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label: artifactPath,
    expectedEvidenceKind: stagingArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: "staging evidence artifacts",
  });
}

function validateEnvironmentArtifacts(signalsByArtifactId) {
  for (const [artifactId, config] of requiredEnvArtifacts.entries()) {
    const artifactPath = readOptionalEnv(config.envVar);
    if (artifactPath === undefined) {
      continue;
    }
    let rawContent;
    try {
      rawContent = readPrivateEvidenceJsonFile(artifactPath, config.envVar);
    } catch (error) {
      violations.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    const content = readArtifactContent({ path: artifactPath }, { rawContent });
    if (content === undefined) {
      continue;
    }

    const artifactLabel = `${config.envVar} (${artifactPath})`;
    validateArtifactContentEnvelope(content, artifactLabel, artifactId);
    validateArtifactProvenance(content.provenance, artifactLabel, {
      allowFixture: false,
    });
    validateNoRealArtifactFixtureMarkers(content, artifactLabel);
    validateEnvArtifactMetadata(content, config, artifactLabel);
    validateRedaction(content, artifactLabel);
    validateSignalResults(
      content,
      {
        artifactId,
        path: artifactLabel,
        startedAt: content.startedAt,
        completedAt: content.completedAt,
      },
      signalsByArtifactId.get(artifactId) ?? [],
      signalPolicyContext,
    );
  }
}

function validateEnvArtifactMetadata(content, config, artifactLabel) {
  validateRealArtifactIdentity(content, artifactLabel);
  for (const envVar of config.requiredEnv) {
    const expected = expectedEnvValueForArtifact(content, config, envVar);
    if (expected === undefined) {
      violations.push(`${config.envVar}: requires ${envVar}`);
      continue;
    }
    if (
      envVar === "STAGING_ENVIRONMENT_ID" &&
      content.environmentId !== expected
    ) {
      violations.push(
        `${artifactLabel}: environmentId must match STAGING_ENVIRONMENT_ID`,
      );
    }
    if (envVar === "BACKEND_IMAGE_DIGEST" && content.imageDigest !== expected) {
      violations.push(
        `${artifactLabel}: imageDigest must match BACKEND_IMAGE_DIGEST`,
      );
    }
    if (envVar === "API_BASE_URL") {
      if (content.apiBaseUrl !== expected) {
        violations.push(`${artifactLabel}: apiBaseUrl must match API_BASE_URL`);
      }
      if (!isHttpUrlWithoutCredentials(content.apiBaseUrl)) {
        violations.push(
          `${artifactLabel}: apiBaseUrl must be an http(s) URL without credentials`,
        );
      }
    }
  }
}

function expectedEnvValueForArtifact(content, config, envVar) {
  const expected = readOptionalEnv(envVar);
  if (expected !== undefined || envVar !== "API_BASE_URL") {
    return expected;
  }
  if (
    backendStagingEvidenceBundlePath === undefined ||
    backendStagingEvidenceBundlePath.length === 0
  ) {
    return undefined;
  }

  let bundle;
  try {
    bundle = JSON.parse(
      readPrivateEvidenceJsonFile(
        backendStagingEvidenceBundlePath,
        "BACKEND_STAGING_EVIDENCE_BUNDLE_PATH",
      ),
    );
  } catch (error) {
    violations.push(error instanceof Error ? error.message : String(error));
    return undefined;
  }

  const artifactPath = readOptionalEnv(config.envVar);
  const bundleArtifact = (bundle.artifacts ?? []).find(
    (item) => item?.artifactId === content.artifactId,
  );
  if (bundleArtifact?.path !== artifactPath) {
    violations.push(
      `BACKEND_STAGING_EVIDENCE_BUNDLE_PATH must reference ${config.envVar} to cover API_BASE_URL`,
    );
    return undefined;
  }
  if (bundle.imageDigest !== content.imageDigest) {
    violations.push(
      `BACKEND_STAGING_EVIDENCE_BUNDLE_PATH imageDigest must match ${config.envVar} imageDigest`,
    );
  }

  const apiBaseUrl =
    typeof content.apiBaseUrl === "string" ? content.apiBaseUrl.trim() : "";
  return apiBaseUrl.length > 0 ? apiBaseUrl : undefined;
}


function readArtifactContent(artifact, options = {}) {
  try {
    const rawContent =
      options.rawContent ?? readFileSync(artifact.path, "utf8");
    validateNoSensitiveArtifactContent(rawContent, artifact.path);
    const content = JSON.parse(rawContent);
    if (!isRecord(content)) {
      violations.push(
        `${artifact.path}: passed staging artifact must be a JSON object`,
      );
      return undefined;
    }

    return content;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    violations.push(
      `${artifact.path}: passed staging artifact must be valid JSON (${message})`,
    );
    return undefined;
  }
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function requirePackageWiring() {
  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (
    !String(
      scripts["capture:docker-staging-reliability-evidence"] ?? "",
    ).includes(dockerStagingReliabilityCapturePath)
  ) {
    violations.push(
      `${packagePath}: capture:docker-staging-reliability-evidence must run ${dockerStagingReliabilityCapturePath}`,
    );
  }
  if (
    !String(scripts["capture:docker-durable-backend-e2e-loop"] ?? "").includes(
      dockerDurableBackendE2eCapturePath,
    )
  ) {
    violations.push(
      `${packagePath}: capture:docker-durable-backend-e2e-loop must run ${dockerDurableBackendE2eCapturePath}`,
    );
  }
  if (
    !String(scripts["capture:durable-backend-e2e-loop"] ?? "").includes(
      durableBackendE2eCapturePath,
    )
  ) {
    violations.push(
      `${packagePath}: capture:durable-backend-e2e-loop must run ${durableBackendE2eCapturePath}`,
    );
  }

  if (!new Set(backendSafe.backendScripts ?? []).has(gateScript)) {
    violations.push(
      `${backendSafePath}: backend-safe verify must include ${gateScript}`,
    );
  }
}

function requireCaptureScriptWiring() {
  const captureSource = readFileSync(
    dockerStagingReliabilityCapturePath,
    "utf8",
  );
  for (const marker of [
    "writeEvidenceEnvFile",
    "validateEvidenceEnvFilePath",
    "validateEvidenceJsonFilePath",
    "STAGING_RELIABILITY_ENV_PATH",
    "RABBITMQ_STAGING_DRILL_ARTIFACT_PATH",
    "POSTGRES_RESTORE_DRILL_ARTIFACT_PATH",
    "STAGING_ENVIRONMENT_ID",
    "BACKEND_IMAGE_DIGEST",
    "mode: 0o600",
    "chmodSync",
    "composePublishedPort",
    "'port', service, containerPort",
    "RABBITMQ_USER",
    "RABBITMQ_PASSWORD",
    "buildRabbitMqUrl",
    "url.username = params.username",
    "url.password = params.password",
  ]) {
    if (!captureSource.includes(marker)) {
      violations.push(
        `${dockerStagingReliabilityCapturePath}: capture must include ${marker}`,
      );
    }
  }

  const e2eCaptureSource = readFileSync(
    dockerDurableBackendE2eCapturePath,
    "utf8",
  );
  for (const marker of [
    "writeEvidenceEnvFile",
    "validateEvidenceEnvFilePath",
    "validateEvidenceJsonFilePath",
    "DURABLE_BACKEND_E2E_ENV_PATH",
    "DURABLE_BACKEND_E2E_ARTIFACT_PATH",
    "API_BASE_URL",
    "STAGING_ENVIRONMENT_ID",
    "BACKEND_IMAGE_DIGEST",
  ]) {
    if (!e2eCaptureSource.includes(marker)) {
      violations.push(
        `${dockerDurableBackendE2eCapturePath}: capture must include ${marker}`,
      );
    }
  }

  for (const [file, markers] of [
    [durableBackendE2eCapturePath, ["mode: 0o600", "chmodSync", "loadConfig(defaultMemoStackTimeoutMs)", 'from "./lib/durable-backend-e2e-config"']],
    ["scripts/lib/durable-backend-e2e-config.ts", ['outputPath: requireEnv("DURABLE_BACKEND_E2E_ARTIFACT_PATH")']],
  ]) {
    const source = readFileSync(file, "utf8");
    for (const marker of markers) {
      if (!source.includes(marker)) {
        violations.push(`${file}: capture must include ${marker}`);
      }
    }
  }

  const selfSource = readFileSync(currentScriptPath, "utf8");
  for (const marker of [
    "readPrivateEvidenceJsonFile",
    "validateDirectArtifactPathGuards",
    "0600-style private file permissions",
  ]) {
    if (!selfSource.includes(marker)) {
      violations.push(
        `${currentScriptPath}: direct staging artifact env path guard must include ${marker}`,
      );
    }
  }
}

function validateDirectArtifactPathGuards() {
  if (process.env.STAGING_RELIABILITY_DIRECT_PATH_GUARD_TEST === "1") {
    return;
  }

  const requiredEnv = {
    STAGING_ENVIRONMENT_ID: "docker-alpha-1",
    BACKEND_IMAGE_DIGEST: `sha256:${"e".repeat(64)}`,
    API_BASE_URL: "http://127.0.0.1:4000",
  };

  for (const config of requiredEnvArtifacts.values()) {
    const workspaceArtifactPath = resolve(
      `${config.envVar.toLowerCase().replaceAll("_", "-")}-direct-workspace-output.json`,
    );
    const workspaceResult = runSelfExpectingFailure({
      ...requiredEnv,
      [config.envVar]: workspaceArtifactPath,
    });
    if (workspaceResult.exitCode === 0) {
      violations.push(
        `check:staging-reliability-evidence must reject workspace ${config.envVar}`,
      );
    } else if (
      !workspaceResult.output.includes(
        `${config.envVar} must not write release evidence into the git workspace`,
      )
    ) {
      violations.push(
        `check:staging-reliability-evidence workspace ${config.envVar} rejection must explain evidence path policy`,
      );
    }
    if (existsSync(workspaceArtifactPath)) {
      violations.push(
        `check:staging-reliability-evidence workspace ${config.envVar} rejection must not create ${workspaceArtifactPath}`,
      );
    }

    const tempDirectory = mkdtempSync(
      join(tmpdir(), "staging-reliability-direct-"),
    );
    try {
      const publicArtifactPath = join(
        tempDirectory,
        "staging-reliability-artifact.json",
      );
      writeFileSync(publicArtifactPath, "{}\n", { mode: 0o600 });
      chmodSync(publicArtifactPath, 0o644);
      const publicModeResult = runSelfExpectingFailure({
        ...requiredEnv,
        [config.envVar]: publicArtifactPath,
      });
      if (publicModeResult.exitCode === 0) {
        violations.push(
          `check:staging-reliability-evidence must reject public ${config.envVar} permissions`,
        );
      } else if (
        !publicModeResult.output.includes(
          `${config.envVar} must use 0600-style private file permissions`,
        )
      ) {
        violations.push(
          `check:staging-reliability-evidence public ${config.envVar} rejection must explain private file mode policy`,
        );
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function runSelfExpectingFailure(env) {
  try {
    execFileSync(process.execPath, [currentScriptPath], {
      env: {
        ...process.env,
        STAGING_RELIABILITY_DIRECT_PATH_GUARD_TEST: "1",
        ...env,
      },
      encoding: "utf8",
      stdio: "pipe",
    });
    return { exitCode: 0, output: "" };
  } catch (error) {
    return {
      exitCode: typeof error.status === "number" ? error.status : 1,
      output: `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    };
  }
}
