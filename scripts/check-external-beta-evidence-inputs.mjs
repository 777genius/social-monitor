import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const matrixPath = 'ops/release/external-beta-evidence-input-matrix.json';
const runnerPath = 'ops/release/external-beta-evidence-runner.json';
const dryRunPath = 'ops/release/external-beta-evidence-dry-run.json';
const envExamplePath = 'ops/release/external-beta-evidence.env.example';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';

const matrix = readJson(matrixPath);
const runner = readJson(runnerPath);
const dryRun = readJson(dryRunPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const envExampleSource = readFileSync(envExamplePath, 'utf8');
const packageScripts = packageJson.scripts ?? {};
const violations = [];
const handoff = readHandoffJson();

validateMatrixContract();
validateClassifications();
validateEnvExample();
validateHandoffEnrichment();
validateWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('External beta evidence input matrix OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readHandoffJson() {
  const output = execFileSync(
    process.execPath,
    ['scripts/external-beta-evidence-runner.mjs', '--handoff-json'],
    {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      env: {
        PATH: process.env.PATH ?? '',
      },
    },
  );
  return JSON.parse(output);
}

function validateMatrixContract() {
  if (matrix.schemaVersion !== 1) {
    violations.push(`${matrixPath}: schemaVersion must be 1`);
  }
  if (matrix.scope !== 'backend-only') {
    violations.push(`${matrixPath}: scope must be backend-only`);
  }
  if (matrix.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${matrixPath}: frontendPolicy must keep frontend deferred`);
  }
  if (matrix.sourceRunnerContract !== runnerPath) {
    violations.push(`${matrixPath}: sourceRunnerContract must be ${runnerPath}`);
  }
  if (matrix.sourceDryRunContract !== dryRunPath) {
    violations.push(`${matrixPath}: sourceDryRunContract must be ${dryRunPath}`);
  }
  if (matrix.envExample !== envExamplePath) {
    violations.push(`${matrixPath}: envExample must be ${envExamplePath}`);
  }
  for (const path of [matrix.sourceRunnerContract, matrix.sourceDryRunContract, matrix.envExample]) {
    if (!existsSync(path ?? '')) {
      violations.push(`${matrixPath}: referenced source must exist: ${path}`);
    }
  }
  if (matrix.secretValuePolicy !== 'never_commit_values') {
    violations.push(`${matrixPath}: secretValuePolicy must be never_commit_values`);
  }
  if (matrix.artifactPathPolicy !== 'absolute_json_private_0600_non_workspace_non_fixture_path') {
    violations.push(`${matrixPath}: artifactPathPolicy must describe absolute JSON private non-workspace evidence paths`);
  }
}

function validateClassifications() {
  const runnerEnv = runnerEnvNames();
  const requiredEnv = new Set((runner.jobs ?? []).flatMap((job) => job.requiredEnv ?? []));
  assertSameSet(requiredEnv, dryRun.requiredMissingEnvWithoutCredentials ?? [], `${matrixPath}: required env set`);

  const classifications = new Map();
  for (const inputClass of matrix.inputClasses ?? []) {
    if (typeof inputClass.inputClass !== 'string' || inputClass.inputClass.trim().length === 0) {
      violations.push(`${matrixPath}: input class must define inputClass`);
      continue;
    }
    if (typeof inputClass.description !== 'string' || inputClass.description.trim().length === 0) {
      violations.push(`${matrixPath}: input class ${inputClass.inputClass} must define description`);
    }
    for (const envName of inputClass.env ?? []) {
      if (classifications.has(envName)) {
        violations.push(`${matrixPath}: env ${envName} is classified more than once`);
      }
      classifications.set(envName, inputClass.inputClass);
    }
  }

  assertSameSet([...classifications.keys()], [...runnerEnv], `${matrixPath}: classified env`);

  for (const envName of runnerEnv) {
    if (envName.endsWith('_PATH') && classifications.get(envName) !== 'artifact_path') {
      violations.push(`${matrixPath}: ${envName} must be classified as artifact_path`);
    }
  }
  for (const envName of ['GITHUB_ACCESS_TOKEN', 'REDDIT_ACCESS_TOKEN', 'REDDIT_APP_CLIENT_SECRET', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN']) {
    if (classifications.get(envName) !== 'secret_value') {
      violations.push(`${matrixPath}: ${envName} must be classified as secret_value`);
    }
  }
  for (const envName of ['DATABASE_URL_SECRET_REF', 'OIDC_CONFIG_SECRET_REF', 'OIDC_TEST_TOKEN_REF', 'RABBITMQ_URL_SECRET_REF', 'SYSTEM_DATABASE_URL_SECRET_REF']) {
    if (classifications.get(envName) !== 'secret_reference') {
      violations.push(`${matrixPath}: ${envName} must be classified as secret_reference`);
    }
  }
  if (classifications.get('BACKEND_IMAGE_DIGEST') !== 'image_digest') {
    violations.push(`${matrixPath}: BACKEND_IMAGE_DIGEST must be classified as image_digest`);
  }
  if (classifications.get('BACKEND_GIT_COMMIT_SHA') !== 'git_commit_sha') {
    violations.push(`${matrixPath}: BACKEND_GIT_COMMIT_SHA must be classified as git_commit_sha`);
  }
  if (classifications.get('DATABASE_URL') !== 'postgres_url') {
    violations.push(`${matrixPath}: DATABASE_URL must be classified as postgres_url`);
  }
  if (classifications.get('RABBITMQ_URL') !== 'rabbitmq_url') {
    violations.push(`${matrixPath}: RABBITMQ_URL must be classified as rabbitmq_url`);
  }
}

function validateEnvExample() {
  for (const envName of runnerEnvNames()) {
    const assignment = new RegExp(`^${escapeRegex(envName)}=`, 'm');
    if (!assignment.test(envExampleSource)) {
      violations.push(`${envExamplePath}: missing ${envName}=`);
    }
    const nonEmptyAssignment = new RegExp(`^${escapeRegex(envName)}=\\S`, 'm');
    if (nonEmptyAssignment.test(envExampleSource)) {
      violations.push(`${envExamplePath}: ${envName} must not commit a value`);
    }
  }
}

function validateHandoffEnrichment() {
  const classificationByEnv = inputClassByEnv();

  if (handoff.inputMatrix?.matrixId !== matrix.matrixId) {
    violations.push(`${matrixPath}: handoff JSON must expose matrixId ${matrix.matrixId}`);
  }
  if (handoff.inputMatrix?.secretValuePolicy !== matrix.secretValuePolicy) {
    violations.push(`${matrixPath}: handoff JSON must expose secretValuePolicy ${matrix.secretValuePolicy}`);
  }
  if (handoff.inputMatrix?.artifactPathPolicy !== matrix.artifactPathPolicy) {
    violations.push(`${matrixPath}: handoff JSON must expose artifactPathPolicy ${matrix.artifactPathPolicy}`);
  }
  if (handoff.safety?.evidencePathPolicy !== matrix.artifactPathPolicy) {
    violations.push(`${matrixPath}: handoff JSON safety must expose evidencePathPolicy ${matrix.artifactPathPolicy}`);
  }

  for (const job of handoff.jobs ?? []) {
    assertSameSet(
      job.requiredInputs?.map((input) => input.env) ?? [],
      job.requiredEnv ?? [],
      `${matrixPath}: ${job.jobId} handoff requiredInputs`,
    );
    assertSameSet(
      job.optionalInputs?.map((input) => input.env) ?? [],
      job.optionalEnv ?? [],
      `${matrixPath}: ${job.jobId} handoff optionalInputs`,
    );
    for (const [index, alternativeInput] of (job.requiredAlternativeInputs ?? []).entries()) {
      const sourceAlternative = (job.requiredEnvAlternatives ?? [])[index];
      assertSameSet(
        alternativeInput.inputs?.map((input) => input.env) ?? [],
        sourceAlternative?.env ?? [],
        `${matrixPath}: ${job.jobId} handoff requiredAlternativeInputs[${index}]`,
      );
      for (const input of alternativeInput.inputs ?? []) {
        if (input.missing !== true) {
          violations.push(`${matrixPath}: ${job.jobId} handoff missing alternative input ${input.env} must be marked missing without env`);
        }
      }
    }

    const allInputs = [
      ...(job.requiredInputs ?? []),
      ...(job.optionalInputs ?? []),
      ...(job.requiredAlternativeInputs ?? []).flatMap((alternativeInput) => alternativeInput.inputs ?? []),
    ];

    for (const input of allInputs) {
      const expectedClass = classificationByEnv.get(input.env);
      if (input.inputClass !== expectedClass) {
        violations.push(`${matrixPath}: ${job.jobId} handoff input ${input.env} must use inputClass ${expectedClass}`);
      }
      if (typeof input.description !== 'string' || input.description.trim().length === 0) {
        violations.push(`${matrixPath}: ${job.jobId} handoff input ${input.env} must include input class description`);
      }
      if (input.inputClass === 'artifact_path' && !Array.isArray(input.artifacts)) {
        violations.push(`${matrixPath}: ${job.jobId} handoff artifact input ${input.env} must include artifacts array`);
      }
    }
  }
}

function validateWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const externalDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'external-beta-evidence');

  if (packageScripts['check:external-beta-evidence-inputs'] !== 'node scripts/check-external-beta-evidence-inputs.mjs') {
    violations.push(`${packagePath}: check:external-beta-evidence-inputs must run the input matrix checker`);
  }
  if (!backendScripts.has('check:external-beta-evidence-inputs')) {
    violations.push(`${backendSafePath}: backendScripts must include check:external-beta-evidence-inputs`);
  }
  if (!baselineScripts.has('check:external-beta-evidence-inputs')) {
    violations.push(`${baselinePath}: requiredGreenScripts must include check:external-beta-evidence-inputs`);
  }
  if (!baselineArtifacts.has(matrixPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${matrixPath}`);
  }
  if (!releaseGateIds.has('external-beta-evidence-inputs')) {
    violations.push(`${releaseContractPath}: requiredGates must include external-beta-evidence-inputs`);
  }
  if (!releaseGateCommands.has(matrix.checkCommand)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${matrix.checkCommand}`);
  }
  if (externalDomain === undefined) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain is required`);
    return;
  }
  if (!externalDomain.gates?.includes('check:external-beta-evidence-inputs')) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include check:external-beta-evidence-inputs`);
  }
  if (!externalDomain.releaseGateIds?.includes('external-beta-evidence-inputs')) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include external-beta-evidence-inputs`);
  }
  if (!externalDomain.artifacts?.includes(matrixPath)) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${matrixPath}`);
  }
}

function inputClassByEnv() {
  const classifications = new Map();
  for (const inputClass of matrix.inputClasses ?? []) {
    for (const envName of inputClass.env ?? []) {
      classifications.set(envName, inputClass.inputClass);
    }
  }
  return classifications;
}

function runnerEnvNames() {
  const envNames = new Set();
  for (const job of runner.jobs ?? []) {
    for (const envName of job.requiredEnv ?? []) {
      envNames.add(envName);
    }
    for (const envName of job.optionalEnv ?? []) {
      envNames.add(envName);
    }
    for (const alternative of job.requiredEnvAlternatives ?? []) {
      for (const envName of alternative.env ?? []) {
        envNames.add(envName);
      }
    }
    for (const artifact of job.outputArtifacts ?? []) {
      if (artifact.env !== undefined) {
        envNames.add(artifact.env);
      }
    }
  }
  return envNames;
}

function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    violations.push(`${label}: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
