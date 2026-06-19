import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/backend-mvp-status-contract.json';
const auditPath = 'ops/release/backend-mvp-completion-audit.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const evidenceRunnerPath = 'ops/release/external-beta-evidence-runner.json';
const evidenceDryRunPath = 'ops/release/external-beta-evidence-dry-run.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const packagePath = 'package.json';

const jsonOutput = process.argv.includes('--json');

const contract = readJson(contractPath);
const audit = readJson(auditPath);
const externalReadiness = readJson(externalReadinessPath);
const evidenceRunner = readJson(evidenceRunnerPath);
const evidenceDryRun = readJson(evidenceDryRunPath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const backendSafe = readJson(backendSafePath);
const baseline = readJson(baselinePath);
const packageJson = readJson(packagePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const evidencePlan = readEvidencePlan({ cleanEnv: !jsonOutput });
const status = buildStatus(evidencePlan);

validateContract();
validateStatus();
validateWiring();

if (violations.length > 0) {
  if (jsonOutput) {
    console.log(JSON.stringify({ ...status, valid: false, violations }, null, 2));
  } else {
    console.error(violations.join('\n'));
  }
  process.exit(1);
}

if (jsonOutput) {
  console.log(JSON.stringify({ ...status, valid: true }, null, 2));
} else {
  console.log('Backend MVP status contract OK');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readEvidencePlan({ cleanEnv }) {
  const env = cleanEnv
    ? {
        PATH: process.env.PATH ?? '',
      }
    : process.env;
  const output = execFileSync(
    process.execPath,
    ['scripts/external-beta-evidence-runner.mjs', '--plan', '--json'],
    {
      encoding: 'utf8',
      env,
    },
  );
  return JSON.parse(output);
}

function buildStatus(plan) {
  const requirements = audit.requirements ?? [];
  const blockingRequirements = requirements.filter((requirement) => requirement.blocksMvpExit === true);
  const passedBlockingRequirements = blockingRequirements.filter((requirement) => requirement.status === 'passed');
  const statusCounts = countBy(requirements, (requirement) => requirement.status);
  const blockerRequirements = blockingRequirements
    .filter((requirement) => requirement.status !== 'passed')
    .map((requirement) => ({
      requirementId: requirement.requirementId,
      planLabel: requirement.planLabel,
      status: requirement.status,
      owner: requirement.owner,
      exitCondition: requirement.exitCondition,
      goCondition: requirement.goCondition,
    }));

  const strictExternalBetaReady = (
    audit.completionStatus === 'complete' &&
    externalReadiness.externalBetaDecision === 'go' &&
    passedBlockingRequirements.length === blockingRequirements.length &&
    plan.externalBlockerJobCount === 0 &&
    plan.externalEvidenceEnvReadinessPercent === 100
  );

  return {
    schemaVersion: 1,
    statusModelId: contract.statusModelId,
    scope: contract.scope,
    frontendPolicy: contract.frontendPolicy,
    sourceAudit: contract.sourceAudit,
    sourceExternalReadiness: contract.sourceExternalReadiness,
    sourceEvidenceRunner: contract.sourceEvidenceRunner,
    decisions: {
      completionStatus: audit.completionStatus,
      externalBetaDecision: externalReadiness.externalBetaDecision,
    },
    strictExternalBetaReady,
    strictExternalBetaExitPercent: percent(passedBlockingRequirements.length, blockingRequirements.length),
    contractClosurePercent: plan.contractClosurePercent,
    externalEvidenceEnvReadinessPercent: plan.externalEvidenceEnvReadinessPercent,
    requirementCount: requirements.length,
    blockingRequirementCount: blockingRequirements.length,
    passedBlockingRequirementCount: passedBlockingRequirements.length,
    requirementStatusCounts: statusCounts,
    externalEvidenceJobCount: plan.jobCount,
    externalBlockerJobCount: plan.externalBlockerJobCount,
    evidenceReadinessCounts: plan.readinessCounts,
    missingRequiredEnv: plan.uniqueMissingEnv,
    missingOptionalEnv: plan.uniqueMissingOptionalEnv,
    blockerRequirements,
  };
}

function validateContract() {
  if (contract.schemaVersion !== 1) {
    violations.push(`${contractPath}: schemaVersion must be 1`);
  }
  if (contract.scope !== 'backend-only') {
    violations.push(`${contractPath}: scope must be backend-only`);
  }
  if (contract.frontendPolicy !== 'deferred_contract_only') {
    violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
  }
  if (contract.sourceAudit !== auditPath) {
    violations.push(`${contractPath}: sourceAudit must be ${auditPath}`);
  }
  if (contract.sourceExternalReadiness !== externalReadinessPath) {
    violations.push(`${contractPath}: sourceExternalReadiness must be ${externalReadinessPath}`);
  }
  if (contract.sourceEvidenceRunner !== evidenceRunnerPath) {
    violations.push(`${contractPath}: sourceEvidenceRunner must be ${evidenceRunnerPath}`);
  }
  if (contract.sourceEvidenceDryRun !== evidenceDryRunPath) {
    violations.push(`${contractPath}: sourceEvidenceDryRun must be ${evidenceDryRunPath}`);
  }
  for (const path of [
    contract.sourceAudit,
    contract.sourceExternalReadiness,
    contract.sourceEvidenceRunner,
    contract.sourceEvidenceDryRun,
  ]) {
    if (!existsSync(path ?? '')) {
      violations.push(`${contractPath}: referenced source must exist: ${path}`);
    }
  }
  if (contract.forbidSubjectiveOverallPercent !== true) {
    violations.push(`${contractPath}: forbidSubjectiveOverallPercent must be true`);
  }
  if (contract.cleanEnvMustRemainBlocked !== true) {
    violations.push(`${contractPath}: cleanEnvMustRemainBlocked must be true`);
  }
  if (contract.secretValuePolicy !== 'env_names_only') {
    violations.push(`${contractPath}: secretValuePolicy must be env_names_only`);
  }
}

function validateStatus() {
  if (audit.scope !== contract.scope || externalReadiness.scope !== contract.scope || evidenceRunner.scope !== contract.scope) {
    violations.push(`${contractPath}: all status sources must stay backend-only`);
  }
  if (
    audit.frontendPolicy !== contract.frontendPolicy ||
    externalReadiness.frontendPolicy !== contract.frontendPolicy ||
    evidenceRunner.frontendPolicy !== contract.frontendPolicy
  ) {
    violations.push(`${contractPath}: all status sources must keep frontend deferred`);
  }
  if (audit.externalBetaDecision !== externalReadiness.externalBetaDecision) {
    violations.push(`${auditPath}: externalBetaDecision must match ${externalReadinessPath}`);
  }
  if (status.requirementCount < contract.minimumRequirementCount) {
    violations.push(`${contractPath}: requirementCount must be at least ${contract.minimumRequirementCount}`);
  }
  if (status.externalEvidenceJobCount < contract.minimumEvidenceJobCount) {
    violations.push(`${contractPath}: externalEvidenceJobCount must be at least ${contract.minimumEvidenceJobCount}`);
  }
  for (const field of contract.requiredStatusFields ?? []) {
    if (status[field] === undefined) {
      violations.push(`${contractPath}: status output must include ${field}`);
    }
  }
  if (status.overallPercent !== undefined || status.mvpReadyPercent !== undefined) {
    violations.push(`${contractPath}: status output must not include subjective overall percent fields`);
  }
  if (externalReadiness.externalBetaDecision === 'hold') {
    if (status.strictExternalBetaReady !== false) {
      violations.push(`${contractPath}: hold decision must produce strictExternalBetaReady=false`);
    }
    if (contract.holdDecisionRequiresBlockers === true && status.blockerRequirements.length === 0) {
      violations.push(`${contractPath}: hold decision must expose blockerRequirements`);
    }
  }
  if (status.strictExternalBetaReady === true) {
    if (status.strictExternalBetaExitPercent !== 100) {
      violations.push(`${contractPath}: strictExternalBetaReady requires strictExternalBetaExitPercent=100`);
    }
    if (status.externalEvidenceEnvReadinessPercent !== 100) {
      violations.push(`${contractPath}: strictExternalBetaReady requires externalEvidenceEnvReadinessPercent=100`);
    }
    if (status.externalBlockerJobCount !== 0 || status.missingRequiredEnv.length !== 0) {
      violations.push(`${contractPath}: strictExternalBetaReady requires no external blockers or missing env`);
    }
  }
  if (contract.cleanEnvMustRemainBlocked === true) {
    assertSameSet(
      status.missingRequiredEnv,
      evidenceDryRun.requiredMissingEnvWithoutCredentials ?? [],
      `${contractPath}: clean-env missingRequiredEnv`,
    );
    if (status.externalEvidenceEnvReadinessPercent !== 0) {
      violations.push(`${contractPath}: clean-env status must keep external evidence readiness at 0`);
    }
    if (status.externalBlockerJobCount === 0) {
      violations.push(`${contractPath}: clean-env status must expose external blocker jobs`);
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

  if (scripts['check:backend-mvp-status'] !== 'node scripts/check-backend-mvp-status.mjs') {
    violations.push(`${packagePath}: check:backend-mvp-status must run the status checker`);
  }
  if (scripts['backend:mvp:status:json'] !== 'node scripts/check-backend-mvp-status.mjs --json') {
    violations.push(`${packagePath}: backend:mvp:status:json must emit status JSON`);
  }
  if (!backendScripts.has('check:backend-mvp-status')) {
    violations.push(`${backendSafePath}: backendScripts must include check:backend-mvp-status`);
  }
  if (!baselineScripts.has('check:backend-mvp-status')) {
    violations.push(`${baselinePath}: requiredGreenScripts must include check:backend-mvp-status`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
  if (!releaseGateIds.has(contract.releaseGateId)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${contract.releaseGateId}`);
  }
  if (!releaseGateCommands.has(contract.checkCommand)) {
    violations.push(`${releaseContractPath}: requiredGates must include ${contract.checkCommand}`);
  }
  if (externalDomain === undefined) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain is required`);
    return;
  }
  if (!externalDomain.gates?.includes('check:backend-mvp-status')) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include check:backend-mvp-status`);
  }
  if (!externalDomain.releaseGateIds?.includes(contract.releaseGateId)) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contract.releaseGateId}`);
  }
  if (!externalDomain.artifacts?.includes(contractPath)) {
    violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contractPath}`);
  }
}

function countBy(values, callback) {
  return values.reduce((counts, value) => {
    const key = callback(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function percent(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function assertSameSet(actual, expected, label) {
  const actualSorted = [...new Set(actual)].sort();
  const expectedSorted = [...new Set(expected)].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    violations.push(`${label}: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`);
  }
}
