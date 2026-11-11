import {
  requiredJobEnvNames,
  requiredJobOptionalEnvNames,
  requiredJobEnvAlternatives,
  requiredJobOutputArtifacts,
  requiredSourceLiveCertificationJobIds,
} from './lib/external-beta-job-evidence-requirements.mjs';
import { releaseDeployNegativeSmokeScenarios, redditArtifactNegativeSmokeScenarios } from './lib/external-beta-artifact-negative-smoke-scenarios.mjs';
import { preflightNegativeSmokeScenarios } from './lib/external-beta-preflight-negative-smoke-scenarios.mjs';
import { createExternalBetaPreflightCommandSmokes } from './lib/external-beta-preflight-command-smokes.mjs';
import { summaryFeedbackNegativeSmokeScenarios } from './lib/external-beta-summary-feedback-negative-smoke-scenarios.mjs';
import { credentialRotationNegativeSmokeScenarios, securityFinalSweepNegativeSmokeScenarios } from './lib/external-beta-security-negative-smoke-scenarios.mjs';
import { durableRuntimeNegativeSmokeScenarios, stagingReliabilityNegativeSmokeScenarios } from './lib/external-beta-runtime-negative-smoke-scenarios.mjs';
import { sourceLiveNegativeSmokeScenarios } from './lib/external-beta-source-live-negative-smoke-scenarios.mjs';
import { validateWiring } from './lib/external-beta-evidence-wiring-policy.mjs';
import { createExternalBetaJobArtifactRequirementsPolicy } from './lib/external-beta-job-artifact-requirements-policy.mjs';
import { validateSafety, validateArtifactFreshnessPolicy } from './lib/external-beta-execution-safety-policy.mjs';
import { createExternalBetaOutputSafetySmokes } from './lib/external-beta-output-safety-smokes.mjs';
import { createExternalBetaJobRequirementsPolicy } from './lib/external-beta-job-requirements-policy.mjs';
import {
  completeExternalEvidencePreflightEnv,
  durableBackendE2ePreflightEnv,
  redditOAuthPreflightEnv,
} from './lib/external-beta-evidence-preflight-fixtures.mjs';
import { validateRunnerImplementationMarkers, redactionPolicyPath, handoffPolicyPath, displayPolicyPath, consistencyPolicyPath, readinessPolicyPath } from './lib/external-beta-evidence-runner-markers.mjs';
import {
  liveOpenConnectorsArtifact,
  redditCredentialLifecycleArtifact,
  liveRedditArtifact,
} from './lib/external-beta-source-live-artifacts.mjs';
import {
  stagingReliabilityArtifact,
  stagingReliabilitySmokeConfigByArtifactId,
  stagingReliabilitySmokeConfigs,
} from './lib/external-beta-staging-reliability-fixtures.mjs';
import {
  securityFinalSweepExportDocuments,
  securityFinalSweepArtifact,
} from './lib/external-beta-security-final-sweep-fixtures.mjs';

import { summaryFeedbackSamplesArtifact } from './lib/external-beta-summary-feedback-fixtures.mjs';

import {
  sourceCredentialRotationArtifact,
  webhookSecretRotationArtifact,
} from './lib/external-beta-credential-rotation-fixtures.mjs';

import { createExternalBetaArtifactValidationSmokes } from './lib/external-beta-artifact-validation-smokes.mjs';
import { createExternalBetaRuntimePlanSmokes } from './lib/external-beta-runtime-plan-smokes.mjs';
import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';
const selectionHelperPath = 'scripts/lib/external-beta-evidence-selections.mjs';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';

const contract = readJson(contractPath);
const externalReadiness = readJson(externalReadinessPath);
const audit = readJson(auditPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const sourceCertification = readJson(sourceCertificationPath);
const sourceLiveArtifactContext = { sourceCertification, sourceCertificationPath };
const runnerSource = readFileSync(contract.runnerFile, 'utf8');
const selectionHelperSource = readFileSync(selectionHelperPath, 'utf8');
const envExampleSource = typeof contract.envExample === 'string' && existsSync(contract.envExample)
  ? readFileSync(contract.envExample, 'utf8')
  : '';
const packageScripts = packageJson.scripts ?? {};
const backendScripts = new Set(backendSafe.backendScripts ?? []);
const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
const externalGroups = new Map((externalReadiness.requiredEvidenceGroups ?? []).map((group) => [group.groupId, group]));
const auditRequirements = new Map((audit.requirements ?? []).map((requirement) => [requirement.requirementId, requirement]));
const checkSource = readFileSync(contract.checkFile, 'utf8');
const violations = [];
const artifactValidationSmokeTimeoutMs = 300_000;
const {
  runRunnerNegativeSmoke,
  runRunnerSecurityFinalSweepArtifactSmoke,
  runRunnerCredentialRotationArtifactSmoke,
  runRunnerDurableRuntimeArtifactSmoke,
  runRunnerStagingReliabilityArtifactSmoke,
  runRunnerSummaryFeedbackArtifactSmoke,
  runRunnerReleaseDeployArtifactSmoke,
  runRunnerArtifactSmoke,
  runRunnerRedditArtifactSmoke,
} = createExternalBetaArtifactValidationSmokes({
  contract,
  execFileSync,
  artifactValidationSmokeTimeoutMs,
  releaseDeploySmokeImageDigest,
  childProcessErrorOutput,
});
const strictSemanticNegativeSmokeLabels = new Set([
  'durable runtime in-memory selector',
  'durable runtime missing event relay',
  'durable runtime forbidden rollup',
  'staging reliability missing postgres signal',
  'staging reliability failed durable signal',
  'summary feedback fixture sample id',
  'summary feedback fixture sample signal text',
  'summary feedback non-real source kind',
  'summary feedback missing source export traceability',
  'summary feedback raw source redaction flag',
  'summary feedback missing minimum samples',
  'summary feedback rollup mismatch',
  'summary feedback forbidden sensitive field',
  'release deploy commit mismatch',
  'release deploy artifact digest mismatch',
  'release deploy missing smoke result',
  'release deploy raw headers redaction flag',
  'source rotation missing preview operation',
  'webhook rotation unchanged old key',
  'security sweep missing public error export',
  'security sweep missing audit metadata export',
  'security sweep mismatched export digest',
  'security sweep unsafe diagnostic field',
  'security sweep raw source redaction flag',
  'reddit lifecycle hash mismatch',
  'reddit lifecycle missing redacted preview',
  'reddit lifecycle non ISO observedAt',
  'reddit live signal non ISO observedAt',
]);
const representativeSemanticNegativeSmokeLabels = new Set([
  'durable runtime in-memory selector',
  'staging reliability missing postgres signal',
  'summary feedback fixture sample id',
  'release deploy commit mismatch',
  'source rotation missing preview operation',
  'security sweep missing public error export',
  'reddit lifecycle hash mismatch',
]);
const runnerSmokeTimeoutMs = 30_000;
const {
  validateRunnerLocalRuntimePlanSmoke,
  validateRunnerDockerBundleAlternativeSmoke,
} = createExternalBetaRuntimePlanSmokes({
  contract, violations, execFileSync, runnerSmokeTimeoutMs,
  mkdtempSync, tmpdir, join, writeFileSync, chmodSync, rmSync,
  durableBackendE2ePreflightEnv, childProcessErrorOutput, smokeOutputSnippet,
});
const {
  validateRunnerPreflightNegativeSmokes,
  validateRunnerPreflightPositiveSmoke,
} = createExternalBetaPreflightCommandSmokes({
  contract, violations, execFileSync, runnerSmokeTimeoutMs,
  preflightNegativeSmokeScenarios, mkdtempSync, tmpdir, join, rmSync,
  completeExternalEvidencePreflightEnv, redditOAuthPreflightEnv,
  childProcessErrorOutput, smokeOutputSnippet,
});
const { validateRunnerOutputRedactionSmoke, validateRunnerEnvFileSmokes } = createExternalBetaOutputSafetySmokes({
  contract, violations, completeExternalEvidencePreflightEnv,
  execFileSync, runnerSmokeTimeoutMs, childProcessErrorOutput, smokeOutputSnippet,
});

const allowedModes = new Set([
  'local_contract',
  'live_network',
  'redacted_samples',
  'staging_artifact',
  'staging_deploy',
]);
const allowedRunPolicies = new Set([
  'live_command',
  'local_contract',
  'manual_artifact_then_validator',
]);
const forbiddenFragments = [
  'frontend',
  'mobile',
  'flutter',
  'agent-runtime',
  'claude-hooks',
];
const forbiddenLiteralFragments = [
  'bearer ',
  'basic ',
  'private_key',
  'client_secret=',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];

const {
  validateEnvExample,
  validateJobBasics,
  validateJobCommands,
  validateJobEnvironment,
  validateJobScopeSafety,
} = createExternalBetaJobRequirementsPolicy({
  violations, contract, contractPath, envExampleSource, allowedModes, allowedRunPolicies,
  externalGroups, auditRequirements, backendScripts, forbiddenFragments,
  validateCommand, scriptNameFromCommand,
});

const { validateJobArtifacts, validateRequiredJobEvidence } = createExternalBetaJobArtifactRequirementsPolicy({
  violations, requiredJobEnvNames, requiredJobOptionalEnvNames,
  requiredJobEnvAlternatives, requiredJobOutputArtifacts,
  existsSync, validationCommandSource,
});

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}
if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}
if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}
if (contract.defaultMode !== 'plan_only') {
  violations.push(`${contractPath}: defaultMode must be plan_only`);
}
for (const field of ['runnerFile', 'checkFile', 'envExample']) {
  if (!existsSync(contract[field] ?? '')) {
    violations.push(`${contractPath}: ${field} must reference an existing file`);
  }
}

validateCommand(contract.checkCommand, `${contractPath}: checkCommand`);
validateCommand(contract.planCommand, `${contractPath}: planCommand`);
validateCommand(contract.jsonPlanCommand, `${contractPath}: jsonPlanCommand`);
validateCommand(contract.summaryCommand, `${contractPath}: summaryCommand`);
validateCommand(contract.handoffCommand, `${contractPath}: handoffCommand`);
validateCommand(contract.handoffJsonCommand, `${contractPath}: handoffJsonCommand`);
validateCommand(contract.preflightCommand, `${contractPath}: preflightCommand`);
validateCommand(contract.artifactValidationCommand, `${contractPath}: artifactValidationCommand`);
validateCommand(contract.dockerBundleImportCommand, `${contractPath}: dockerBundleImportCommand`);
validateCommand(contract.currentPackageCommand, `${contractPath}: currentPackageCommand`);
validateCommand(contract.executeCommand, `${contractPath}: executeCommand`);
validateSafety({ contract, contractPath, forbiddenFragments, violations });
validateArtifactFreshnessPolicy({ contract, contractPath, violations });
validateArtifactExamples();
validateRunnerImplementation();
validateRunnerPositiveDurableRuntimeArtifactSmoke();
validateRunnerNegativeDurableRuntimeArtifactSmokes();
validateRunnerPositiveCredentialRotationArtifactSmoke();
validateRunnerNegativeCredentialRotationArtifactSmokes();
validateRunnerPositiveSecurityFinalSweepArtifactSmoke();
validateRunnerNegativeSecurityFinalSweepArtifactSmokes();
validateRunnerPositiveStagingReliabilityArtifactSmokes();
validateRunnerNegativeStagingReliabilityArtifactSmokes();
validateRunnerPositiveSummaryFeedbackArtifactSmoke();
validateRunnerNegativeSummaryFeedbackArtifactSmokes();
validateRunnerPositiveReleaseDeployArtifactSmoke();
validateRunnerNegativeReleaseDeployArtifactSmokes();
validateRunnerPositiveArtifactSmoke();
validateRunnerPositiveRedditArtifactSmoke();
validateRunnerNegativeRedditArtifactSmokes();
validateRunnerNegativeSmokes();
validateRunnerPreflightNegativeSmokes();
validateRunnerLocalRuntimePlanSmoke();
validateRunnerDockerBundleAlternativeSmoke();
validateRunnerOutputRedactionSmoke();
validateRunnerEnvFileSmokes();
validateRunnerPreflightPositiveSmoke();
validateJobs();
validateEnvExample();
validateWiring({
  contract, contractPath, externalReadiness, externalReadinessPath,
  packageScripts, packagePath, backendScripts, backendSafePath,
  baselineScripts, baselineArtifacts, baselinePath,
  violations, scriptNameFromCommand,
});
validateNoSensitiveLiterals();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta evidence runner contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateArtifactExamples() {
  if (!Array.isArray(contract.artifactExamples) || contract.artifactExamples.length === 0) {
    violations.push(`${contractPath}: artifactExamples must be a non-empty array`);
    return;
  }

  const examplesByFormat = new Map();
  for (const example of contract.artifactExamples) {
    const label = `${contractPath}: artifact example "${example?.format ?? '<missing>'}"`;
    if (typeof example?.format !== 'string' || example.format.trim().length === 0) {
      violations.push(`${label}: format must be a non-empty string`);
      continue;
    }
    if (typeof example.path !== 'string' || example.path.trim().length === 0) {
      violations.push(`${label}: path must be a non-empty string`);
      continue;
    }
    if (examplesByFormat.has(example.format)) {
      violations.push(`${contractPath}: duplicate artifact example format "${example.format}"`);
    }
    examplesByFormat.set(example.format, example.path);

    if (!existsSync(example.path)) {
      violations.push(`${label}: path must exist: ${example.path}`);
      continue;
    }
    if (!baselineArtifacts.has(example.path)) {
      violations.push(`${baselinePath}: trackedArtifacts must include artifact example ${example.path}`);
    }

    const source = readFileSync(example.path, 'utf8');
    if (!source.includes(example.format)) {
      violations.push(`${label}: example file must mention format "${example.format}"`);
    }
    if (!source.includes('"fixtureOnly": true') && !source.includes('"evidenceKind": "fixture_example"')) {
      violations.push(`${label}: example file must be marked as fixture-only`);
    }
  }

  const envArtifactFormats = new Set(
    contract.jobs
      .flatMap((job) => job.outputArtifacts ?? [])
      .filter((artifact) => artifact.env !== undefined)
      .map((artifact) => artifact.format),
  );

  for (const format of envArtifactFormats) {
    if (!examplesByFormat.has(format)) {
      violations.push(`${contractPath}: artifactExamples must include env artifact format "${format}"`);
    }
  }
  for (const format of examplesByFormat.keys()) {
    if (!envArtifactFormats.has(format)) {
      violations.push(`${contractPath}: artifactExamples contains unused format "${format}"`);
    }
  }
}

function validateRunnerImplementation() {
  violations.push(...validateRunnerImplementationMarkers({
    runnerSource,
    checkSource,
    selectionHelperSource,
    handoffSource: readFileSync(handoffPolicyPath, 'utf8'),
    displaySource: readFileSync(displayPolicyPath, 'utf8'),
    consistencyPolicySource: readFileSync(consistencyPolicyPath, 'utf8'),
    readinessPolicySource: readFileSync(readinessPolicyPath, 'utf8'),
    redactionPolicySource: readFileSync(redactionPolicyPath, 'utf8'),
    runnerFile: contract.runnerFile,
    checkFile: contract.checkFile,
    selectionHelperPath,
  }));
}

function validateRunnerNegativeSmokes() {
  const scenarios = sourceLiveNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-negative-'));
    const artifactPath = join(tempDirectory, 'live-open-connectors.json');
    const baseArtifact = liveOpenConnectorsArtifact(sourceLiveArtifactContext);
    const artifact = typeof scenario.artifact === 'function'
      ? scenario.artifact(baseArtifact)
      : {
        ...baseArtifact,
        ...scenario.artifactPatch,
      };
    try {
      writeFileSync(
        artifactPath,
        typeof scenario.artifactContent === 'function'
          ? scenario.artifactContent(artifact)
          : `${JSON.stringify(artifact, null, 2)}\n`,
        { mode: 0o600 },
      );
      if (scenario.fileMode !== undefined) {
        chmodSync(artifactPath, scenario.fileMode);
      }

      const result = runRunnerNegativeSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function validateRunnerPositiveArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-positive-'));
  const artifactPath = join(tempDirectory, 'live-open-connectors.json');
  try {
    writeFileSync(
      artifactPath,
      `${JSON.stringify(liveOpenConnectorsArtifact(sourceLiveArtifactContext), null, 2)}\n`,
      { mode: 0o600 },
    );

    const result = runRunnerArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive artifact smoke must accept valid live-open-connectors evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerPositiveDurableRuntimeArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-positive-'));
  try {
    const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory);
    const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive durable runtime artifact smoke must accept a valid runtime selector artifact: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeDurableRuntimeArtifactSmokes() {
  const scenarios = durableRuntimeNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-negative-'));
    try {
      const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory, scenario);
      const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative durable runtime smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative durable runtime smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeDurableRuntimeSelectorArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'durable-runtime-selector.json');
  const artifact = durableRuntimeSelectorArtifact();
  options.mutateArtifact?.(artifact);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return artifactPath;
}

function durableRuntimeSelectorArtifact() {
  const artifact = readJson('ops/release/fixtures/durable-runtime-selector-artifact-examples.json');
  const now = new Date().toISOString();
  const imageDigest = `sha256:${'d'.repeat(64)}`;
  artifact.provenance = {
    evidenceKind: 'staging_runtime_selector',
    collectionMethod: 'Runtime selector snapshot captured from beta staging deployment.',
    runner: 'scripts/capture-durable-runtime-selector.ts',
    fixtureOnly: false,
  };
  artifact.environment = {
    environmentId: 'staging-alpha-1',
    imageDigest,
    apiBaseUrl: 'https://api.staging.social-monitor.invalid',
    sampledAt: now,
    operator: 'release-operator-1',
  };
  artifact.services = artifact.services.map((service) => ({
    ...service,
    healthCheck: {
      ...service.healthCheck,
      checkedAt: now,
    },
  }));
  return artifact;
}

function validateRunnerPositiveStagingReliabilityArtifactSmokes() {
  for (const config of stagingReliabilitySmokeConfigs()) {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-staging-reliability-positive-'));
    try {
      const artifactPath = writeStagingReliabilityArtifact(tempDirectory, config);
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, { contractSmokeArtifactOnly: true });
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive staging reliability smoke must accept valid ${config.artifactId} evidence: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function validateRunnerNegativeStagingReliabilityArtifactSmokes() {
  const scenarios = stagingReliabilityNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-staging-reliability-negative-'));
    try {
      const config = stagingReliabilitySmokeConfigByArtifactId(scenario.artifactId);
      const artifactPath = writeStagingReliabilityArtifact(tempDirectory, config, scenario);
      const result = runRunnerStagingReliabilityArtifactSmoke(config, artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative staging reliability smoke for ${scenario.label} must report "${scenario.expectedOutput}"; observed: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeStagingReliabilityArtifact(tempDirectory, config, options = {}) {
  const artifactPath = join(tempDirectory, `${config.artifactId}.json`);
  const artifact = stagingReliabilityArtifact(config, readJson('ops/drills/fixtures/staging-reliability-artifact-examples.json'));
  options.mutateArtifact?.(artifact);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact, config)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return artifactPath;
}

function validateRunnerPositiveSummaryFeedbackArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-summary-feedback-positive-'));
  try {
    const artifactPath = writeSummaryFeedbackSamplesArtifact(tempDirectory);
    const result = runRunnerSummaryFeedbackArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive summary feedback artifact smoke must accept valid redacted feedback samples: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeSummaryFeedbackArtifactSmokes() {
  const scenarios = summaryFeedbackNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-summary-feedback-negative-'));
    try {
      const artifactPath = writeSummaryFeedbackSamplesArtifact(tempDirectory, scenario);
      const result = runRunnerSummaryFeedbackArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative summary feedback smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative summary feedback smoke for ${scenario.label} must report "${scenario.expectedOutput}"; observed: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeSummaryFeedbackSamplesArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'summary-real-feedback-samples.json');
  const artifact = summaryFeedbackSamplesArtifact(readJson('ops/release/fixtures/redacted-summary-feedback-samples-examples.json'));
  options.mutateArtifact?.(artifact);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return artifactPath;
}

function validateRunnerPositiveReleaseDeployArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-release-deploy-positive-'));
  try {
    const artifactPath = writeReleaseDeploySmokeArtifact(tempDirectory);
    const result = runRunnerReleaseDeployArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive release deploy artifact smoke must accept valid deploy smoke evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeReleaseDeployArtifactSmokes() {
  const scenarios = releaseDeployNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-release-deploy-negative-'));
    try {
      const artifactPath = writeReleaseDeploySmokeArtifact(tempDirectory, scenario);
      const result = runRunnerReleaseDeployArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative release deploy smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative release deploy smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeReleaseDeploySmokeArtifact(tempDirectory, options = {}) {
  const artifactPath = join(tempDirectory, 'release-deploy-smoke.json');
  const artifact = releaseDeploySmokeArtifact();
  options.mutateArtifact?.(artifact);
  writeFileSync(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return artifactPath;
}

function releaseDeploySmokeArtifact() {
  const releaseEvidence = readJson('ops/release/release-artifact-evidence.json');
  const fixture = readJson('ops/release/fixtures/release-deploy-smoke-artifact-examples.json');
  const artifact = JSON.parse(JSON.stringify(fixture.examples[0]));
  const imageDigest = releaseDeploySmokeImageDigest();
  const sampledAt = new Date(Date.now() - 60 * 1000).toISOString();
  const openApiDigest = releaseEvidence.artifactDigests.find((item) => item.artifactId === 'openapi-snapshot')?.value;
  const gitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

  artifact.artifactId = 'backend-release-deploy-smoke-staging-alpha-1';
  artifact.environmentId = 'staging-alpha-1';
  artifact.imageDigest = imageDigest;
  artifact.apiBaseUrl = 'https://api.staging.social-monitor.invalid';
  artifact.commitSha = gitSha;
  artifact.migrationVersion = releaseEvidence.migrationVersion;
  artifact.operator = 'release-owner-1';
  artifact.sampledAt = sampledAt;
  artifact.provenance = {
    evidenceKind: 'staging_deploy',
    collectionMethod: 'Deploy smoke evidence captured from beta backend staging release.',
    runner: 'scripts/capture-release-deploy-smoke.ts',
    fixtureOnly: false,
  };
  artifact.artifactDigests = releaseEvidence.artifactDigests;
  artifact.smokeResults = artifact.smokeResults.map((result, index) => {
    const observedAt = new Date(Date.parse(sampledAt) + (index + 1) * 1000).toISOString();
    const refreshed = {
      ...result,
      observedAt,
    };
    if (refreshed.smokeId === 'openapi-contract') {
      refreshed.evidence.deployedOpenApiSha256 = openApiDigest;
      refreshed.evidence.committedOpenApiSha256 = openApiDigest;
    }
    if (refreshed.smokeId === 'migration-version') {
      refreshed.evidence.deployedMigrationValue = releaseEvidence.migrationVersion.value;
      refreshed.evidence.releaseMigrationValue = releaseEvidence.migrationVersion.value;
    }
    return refreshed;
  });

  return artifact;
}

function releaseDeploySmokeImageDigest() {
  return `sha256:${'4'.repeat(64)}`;
}

function validateRunnerPositiveCredentialRotationArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-positive-'));
  try {
    const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(tempDirectory);
    const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive credential rotation artifact smoke must accept valid redacted rotation artifacts: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeCredentialRotationArtifactSmokes() {
  const scenarios = credentialRotationNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-rotation-negative-'));
    try {
      const { sourceArtifactPath, webhookArtifactPath } = writeCredentialRotationArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerCredentialRotationArtifactSmoke(sourceArtifactPath, webhookArtifactPath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative credential rotation smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative credential rotation smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeCredentialRotationArtifactPair(tempDirectory, options = {}) {
  const sourceArtifactPath = join(tempDirectory, 'source-credential-rotation.json');
  const webhookArtifactPath = join(tempDirectory, 'webhook-secret-rotation.json');
  const sourceArtifact = sourceCredentialRotationArtifact(readJson('ops/security/fixtures/source-credential-rotation-redacted-examples.json'));
  const webhookArtifact = webhookSecretRotationArtifact(readJson('ops/security/fixtures/webhook-secret-rotation-redacted-examples.json'));
  options.mutateSource?.(sourceArtifact);
  options.mutateWebhook?.(webhookArtifact);
  writeFileSync(
    sourceArtifactPath,
    typeof options.sourceContent === 'function'
      ? options.sourceContent(sourceArtifact)
      : `${JSON.stringify(sourceArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  writeFileSync(
    webhookArtifactPath,
    typeof options.webhookContent === 'function'
      ? options.webhookContent(webhookArtifact)
      : `${JSON.stringify(webhookArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { sourceArtifactPath, webhookArtifactPath };
}

function validateRunnerPositiveSecurityFinalSweepArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-positive-'));
  try {
    const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(tempDirectory);
    const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive security final sweep artifact smoke must accept valid redacted export evidence: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeSecurityFinalSweepArtifactSmokes() {
  const scenarios = securityFinalSweepNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-security-negative-'));
    try {
      const { artifactPath, exportPaths } = writeSecurityFinalSweepArtifact(
        tempDirectory,
        scenario,
      );
      const result = runRunnerSecurityFinalSweepArtifactSmoke(artifactPath, exportPaths, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative security final sweep smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative security final sweep smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeSecurityFinalSweepArtifact(tempDirectory, options = {}) {
  const exportDocuments = securityFinalSweepExportDocuments();
  options.mutateExports?.(exportDocuments);
  const exportPaths = writeSecurityFinalSweepExports(tempDirectory, exportDocuments);
  const artifactPath = join(tempDirectory, 'security-final-sweep.json');
  const artifact = securityFinalSweepArtifact(exportPaths, readJson('ops/security/fixtures/security-final-sweep-staging-artifact-examples.json'));
  options.mutateArtifact?.(artifact, exportPaths);
  const artifactContent = typeof options.artifactContent === 'function'
    ? options.artifactContent(artifact, exportPaths)
    : `${JSON.stringify(artifact, null, 2)}\n`;
  writeFileSync(
    artifactPath,
    artifactContent,
    { mode: 0o600 },
  );
  return { artifactPath, exportPaths };
}

function writeSecurityFinalSweepExports(tempDirectory, exportDocuments) {
  return {
    logs: writeSecurityFinalSweepExport(tempDirectory, 'logs-export.json', exportDocuments.logs),
    metrics: writeSecurityFinalSweepExport(tempDirectory, 'metrics-export.json', exportDocuments.metrics),
    publicErrors: writeSecurityFinalSweepExport(
      tempDirectory,
      'public-errors-export.json',
      exportDocuments.publicErrors,
    ),
    auditMetadata: writeSecurityFinalSweepExport(
      tempDirectory,
      'audit-events-export.json',
      exportDocuments.auditMetadata,
    ),
  };
}

function writeSecurityFinalSweepExport(tempDirectory, filename, document) {
  const path = join(tempDirectory, filename);
  const content = `${JSON.stringify(document, null, 2)}\n`;
  writeFileSync(path, content, { mode: 0o600 });
  return {
    path,
    sha256: createHash('sha256').update(content).digest('hex'),
    sampleCount: document.records.length,
  };
}

function validateRunnerPositiveRedditArtifactSmoke() {
  const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-positive-'));
  try {
    const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(tempDirectory);
    const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive Reddit artifact smoke must accept valid live Reddit evidence and lifecycle pair: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }

  const durableLifecycleDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-durable-lifecycle-'));
  try {
    const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(durableLifecycleDirectory, {
      mutateLifecycle: (artifact) => {
        artifact.imageDigest = `sha256:${'c'.repeat(64)}`;
        artifact.commitSha = 'c'.repeat(40);
      },
    });
    const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, { contractSmokeArtifactOnly: true });
    if (result.exitCode !== 0) {
      violations.push(`${contract.runnerFile}: runner positive Reddit artifact smoke must accept a durable lifecycle artifact from a previous release image: ${smokeOutputSnippet(result.output)}`);
    }
  } finally {
    rmSync(durableLifecycleDirectory, { recursive: true, force: true });
  }
}

function validateRunnerNegativeRedditArtifactSmokes() {
  const scenarios = redditArtifactNegativeSmokeScenarios();

  for (const scenario of scenarios) {
    if (!shouldRunNegativeSmoke(scenario.label)) {
      continue;
    }
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-reddit-negative-'));
    try {
      const { liveArtifactPath, lifecyclePath } = writeRedditArtifactPair(
        tempDirectory,
        scenario,
      );
      const result = runRunnerRedditArtifactSmoke(liveArtifactPath, lifecyclePath, negativeSmokeOptions(scenario.label));
      if (result.exitCode === 0) {
        violations.push(`${contract.runnerFile}: runner negative Reddit smoke must reject ${scenario.label}`);
        continue;
      }
      if (!result.output.includes(scenario.expectedOutput)) {
        violations.push(`${contract.runnerFile}: runner negative Reddit smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}

function writeRedditArtifactPair(tempDirectory, options = {}) {
  const lifecyclePath = join(tempDirectory, 'reddit-credential-lifecycle.json');
  const liveArtifactPath = join(tempDirectory, 'reddit-live-evidence.json');
  const lifecycleArtifact = redditCredentialLifecycleArtifact();
  options.mutateLifecycle?.(lifecycleArtifact);
  const lifecycleContent = `${JSON.stringify(lifecycleArtifact, null, 2)}\n`;
  const lifecycleSha256 = createHash('sha256').update(lifecycleContent).digest('hex');
  const liveArtifact = liveRedditArtifact(options.lifecycleArtifactSha256 ?? lifecycleSha256, sourceLiveArtifactContext);
  options.mutateLive?.(liveArtifact, lifecycleSha256);
  writeFileSync(lifecyclePath, lifecycleContent, { mode: 0o600 });
  writeFileSync(
    liveArtifactPath,
    `${JSON.stringify(liveArtifact, null, 2)}\n`,
    { mode: 0o600 },
  );
  return { liveArtifactPath, lifecyclePath, lifecycleSha256 };
}

function negativeSmokeOptions(label) {
  return {
    contractSmokeArtifactOnly: !strictSemanticNegativeSmokeLabels.has(label),
  };
}

function shouldRunNegativeSmoke(label) {
  return (
    !strictSemanticNegativeSmokeLabels.has(label) ||
    representativeSemanticNegativeSmokeLabels.has(label)
  );
}




function childProcessErrorOutput(error) {
  const chunks = [
    error.stdout,
    error.stderr,
    ...(Array.isArray(error.output) ? error.output : []),
    error.message,
  ];

  return chunks
    .filter((chunk) => chunk !== undefined && chunk !== null)
    .map((chunk) => Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk))
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n');
}










function smokeOutputSnippet(output) {
  return String(output)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-8)
    .join(' | ');
}

function validateJobs() {
  if (!Array.isArray(contract.jobs) || contract.jobs.length === 0) {
    violations.push(`${contractPath}: jobs must be a non-empty array`);
    return;
  }

  const jobIds = new Set();
  const coveredGroups = new Set();
  const coveredRequirements = new Set();
  const sourceJobs = new Set();

  for (const job of contract.jobs) {
    const label = `${contractPath}: job "${job.jobId ?? '<missing>'}"`;
    if (jobIds.has(job.jobId)) {
      violations.push(`${contractPath}: duplicate jobId "${job.jobId}"`);
    }
    jobIds.add(job.jobId);
    coveredGroups.add(job.evidenceGroupId);
    coveredRequirements.add(job.requirementId);

    validateJobBasics(job, label);
    validateJobCommands(job, label);
    validateJobEnvironment(job, label);
    validateJobArtifacts(job, label);
    validateRequiredJobEvidence(job, label);
    validateJobScopeSafety(job, label);

    if (job.evidenceGroupId === 'source-provider-live-certification') {
      sourceJobs.add(job.jobId);
    }
  }

  for (const groupId of externalGroups.keys()) {
    if (!coveredGroups.has(groupId)) {
      violations.push(`${contractPath}: jobs must cover external readiness group "${groupId}"`);
    }
  }
  for (const requirementId of auditRequirements.keys()) {
    if (!coveredRequirements.has(requirementId)) {
      violations.push(`${contractPath}: jobs must cover backend MVP requirement "${requirementId}"`);
    }
  }
  for (const requiredSourceJob of requiredSourceLiveCertificationJobIds) {
    if (!sourceJobs.has(requiredSourceJob)) {
      violations.push(`${contractPath}: source live certification must include ${requiredSourceJob}`);
    }
  }
}

function validateNoSensitiveLiterals() {
  const serialized = JSON.stringify(contract).toLowerCase();
  for (const fragment of forbiddenLiteralFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${contractPath}: contract must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateCommand(command, label) {
  const scriptName = scriptNameFromCommand(command);
  if (scriptName === null) {
    violations.push(`${label}: command must use npm run`);
    return;
  }
  if (!packageScripts[scriptName]) {
    violations.push(`${label}: references missing npm script "${scriptName}"`);
  }
}

function validationCommandSource(command) {
  const scriptName = scriptNameFromCommand(command);
  if (scriptName === null) {
    return '';
  }

  const script = String(packageScripts[scriptName] ?? '');
  const referencedFiles = [...new Set([...script.matchAll(/\bscripts\/[^\s&|;]+?\.(?:mjs|js|ts)\b/g)].map((match) => match[0]))];
  return referencedFiles
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n');
}

function scriptNameFromCommand(command) {
  return /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''))?.[1] ?? null;
}
