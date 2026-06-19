import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const contractPath = 'ops/release/no-go-cleanup-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const betaDecisionPath = 'ops/release/beta-ring-expansion-decision-record.json';
const betaFeedbackPath = 'ops/release/beta-feedback-classification-report.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';

const contract = readJson(contractPath);
const externalReadiness = readJson(externalReadinessPath);
const betaDecision = readJson(betaDecisionPath);
const betaFeedback = readJson(betaFeedbackPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:no-go-cleanup';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'no-go-cleanup';
const allowedPendingStatuses = new Set([
  'contract_ready',
  'pending_staging_evidence',
  'blocked_without_live_credentials',
  'blocked_until_real_feedback',
  'pending_image_digest_and_deploy_smoke',
  'hold',
]);

if (contract.schemaVersion !== 1) {
  violations.push(`${contractPath}: schemaVersion must be 1`);
}

if (contract.scope !== 'backend-only') {
  violations.push(`${contractPath}: scope must be backend-only`);
}

if (contract.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${contractPath}: frontendPolicy must keep frontend deferred`);
}

if (contract.externalBetaStatus !== 'hold_until_all_exceptions_resolved') {
  violations.push(`${contractPath}: externalBetaStatus must hold until all no-go exceptions are resolved`);
}

if (contract.externalReadinessContract !== externalReadinessPath) {
  violations.push(`${contractPath}: externalReadinessContract must reference ${externalReadinessPath}`);
}

validateExternalReadinessHold();
validateNoGoExceptions();
validateClaimAudits();
validateForbiddenGoClaims();
validateDocumentationClaimScan();
validateDecisionArtifacts();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('No-go cleanup contract OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateExternalReadinessHold() {
  if (externalReadiness.externalBetaDecision !== 'hold') {
    violations.push(`${externalReadinessPath}: externalBetaDecision must remain hold while no-go cleanup is active`);
  }

  const groups = externalReadiness.requiredEvidenceGroups ?? [];
  const hasPendingOrBlockedGroup = groups.some((group) => group.status !== 'passed');
  if (hasPendingOrBlockedGroup && externalReadiness.externalBetaDecision !== 'hold') {
    violations.push(`${externalReadinessPath}: pending evidence groups require externalBetaDecision=hold`);
  }

  for (const group of groups) {
    if (typeof group.owner !== 'string' || group.owner.trim().length === 0) {
      violations.push(`${externalReadinessPath}: evidence group "${group.groupId}" must define owner`);
    }
    if (typeof group.exitCondition !== 'string' || group.exitCondition.trim().length === 0) {
      violations.push(`${externalReadinessPath}: evidence group "${group.groupId}" must define exitCondition`);
    }
    if (group.blocksExternalBeta !== true) {
      violations.push(`${externalReadinessPath}: evidence group "${group.groupId}" must block external beta`);
    }
    if (group.status !== 'passed' && !allowedPendingStatuses.has(group.status)) {
      violations.push(`${externalReadinessPath}: evidence group "${group.groupId}" has unsupported hold status "${group.status}"`);
    }
  }
}

function validateNoGoExceptions() {
  const requiredExceptionIds = new Set(contract.requiredExceptionIds ?? []);
  const exceptions = new Map();

  for (const exception of externalReadiness.noGoExceptions ?? []) {
    if (exceptions.has(exception.exceptionId)) {
      violations.push(`${externalReadinessPath}: duplicate noGoException "${exception.exceptionId}"`);
    }
    exceptions.set(exception.exceptionId, exception);

    if (exception.blocking !== true) {
      violations.push(`${externalReadinessPath}: noGoException "${exception.exceptionId}" must be blocking`);
    }
    for (const field of ['owner', 'exitCondition']) {
      if (typeof exception[field] !== 'string' || exception[field].trim().length === 0) {
        violations.push(`${externalReadinessPath}: noGoException "${exception.exceptionId}" must define ${field}`);
      }
    }
  }

  for (const exceptionId of requiredExceptionIds) {
    if (!exceptions.has(exceptionId)) {
      violations.push(`${externalReadinessPath}: missing noGoException "${exceptionId}"`);
    }
  }
}

function validateClaimAudits() {
  const claimIds = new Set();

  for (const claim of contract.claimAudits ?? []) {
    if (claimIds.has(claim.claimId)) {
      violations.push(`${contractPath}: duplicate claimAudit "${claim.claimId}"`);
    }
    claimIds.add(claim.claimId);

    if (claim.blocking !== true) {
      violations.push(`${contractPath}: claimAudit "${claim.claimId}" must be blocking`);
    }
    for (const field of ['owner', 'exitCondition', 'currentClaim', 'requiredQualifier']) {
      if (typeof claim[field] !== 'string' || claim[field].trim().length === 0) {
        violations.push(`${contractPath}: claimAudit "${claim.claimId}" must define ${field}`);
      }
    }
    if (!existsSync(claim.artifact)) {
      violations.push(`${contractPath}: claimAudit "${claim.claimId}" references missing artifact "${claim.artifact}"`);
      continue;
    }

    const body = readFileSync(claim.artifact, 'utf8');
    if (!body.includes(claim.currentClaim)) {
      violations.push(`${claim.artifact}: claimAudit "${claim.claimId}" missing current claim marker`);
    }
    if (!body.includes(claim.requiredQualifier)) {
      violations.push(`${claim.artifact}: claimAudit "${claim.claimId}" missing required qualifier marker`);
    }
  }

  if (claimIds.size < 8) {
    violations.push(`${contractPath}: claimAudits must cover source, staging, release artifact, feedback, security and docs claims`);
  }
}

function validateForbiddenGoClaims() {
  const scanTargets = new Set((contract.claimAudits ?? []).map((claim) => claim.artifact));
  scanTargets.add(externalReadinessPath);
  scanTargets.add(betaDecisionPath);
  scanTargets.add(betaFeedbackPath);

  for (const path of scanTargets) {
    if (!existsSync(path)) {
      continue;
    }

    const body = readFileSync(path, 'utf8').toLowerCase();
    for (const pattern of contract.forbiddenExternalGoClaimPatterns ?? []) {
      if (body.includes(String(pattern).toLowerCase())) {
        violations.push(`${path}: forbidden external beta readiness claim "${pattern}"`);
      }
    }
  }
}

function validateDocumentationClaimScan() {
  const scan = contract.documentationClaimScan;
  if (typeof scan !== 'object' || scan === null) {
    violations.push(`${contractPath}: documentationClaimScan is required`);
    return;
  }

  const rootPaths = scan.rootPaths ?? [];
  const extensions = new Set(scan.fileExtensions ?? []);
  const forbiddenPatterns = scan.forbiddenPatterns ?? contract.forbiddenExternalGoClaimPatterns ?? [];
  const allowedPhrases = (scan.allowedPhrases ?? []).map((phrase) => String(phrase).toLowerCase());

  if (rootPaths.length === 0) {
    violations.push(`${contractPath}: documentationClaimScan.rootPaths must not be empty`);
  }
  if (extensions.size === 0) {
    violations.push(`${contractPath}: documentationClaimScan.fileExtensions must not be empty`);
  }
  if (forbiddenPatterns.length === 0) {
    violations.push(`${contractPath}: documentationClaimScan.forbiddenPatterns must not be empty`);
  }

  for (const rootPath of rootPaths) {
    if (!existsSync(rootPath)) {
      violations.push(`${contractPath}: documentationClaimScan root path is missing: ${rootPath}`);
      continue;
    }

    for (const path of walkFiles(rootPath, extensions)) {
      const lines = readFileSync(path, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        const lowerLine = line.toLowerCase();
        const allowed = allowedPhrases.some((phrase) => lowerLine.includes(phrase));
        if (allowed) {
          return;
        }
        for (const pattern of forbiddenPatterns) {
          if (lowerLine.includes(String(pattern).toLowerCase())) {
            violations.push(`${path}:${index + 1}: forbidden documentation readiness claim "${pattern}"`);
          }
        }
      });
    }
  }
}

function walkFiles(rootPath, extensions) {
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(path, extensions));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (extensions.has(extname(entry.name))) {
      const stats = statSync(path);
      if (stats.size > 0) {
        files.push(path);
      }
    }
  }
  return files;
}

function validateDecisionArtifacts() {
  if (betaDecision.decision !== 'hold') {
    violations.push(`${betaDecisionPath}: decision must remain hold until external readiness is go`);
  }
  if (betaDecision.evidenceMode !== 'deterministic_pre_beta_fixture') {
    violations.push(`${betaDecisionPath}: evidenceMode must stay deterministic_pre_beta_fixture until real evidence replaces it`);
  }
  if (betaFeedback.evidenceMode !== 'deterministic_pre_beta_fixture') {
    violations.push(`${betaFeedbackPath}: evidenceMode must stay deterministic_pre_beta_fixture until real feedback exists`);
  }
  if (betaFeedback.releaseDecision?.externalRingExpansionStatus !== 'hold_until_real_feedback_report_replaces_fixture') {
    violations.push(`${betaFeedbackPath}: externalRingExpansionStatus must hold until real feedback report replaces fixture`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const externalDomain = (backendOps.requiredDomains ?? []).find(
    (domain) => domain.domainId === 'external-beta-evidence',
  );
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'no-go-cleanup',
  );
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (externalDomain === undefined) {
    violations.push(`${backendOpsPath}: missing external-beta-evidence domain`);
  } else {
    if (!externalDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${gateScript}`);
    }
    if (!externalDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${gateId}`);
    }
    if (!externalDomain.artifacts?.includes(contractPath)) {
      violations.push(`${backendOpsPath}: external-beta-evidence domain must include ${contractPath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing no-go-cleanup group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: no-go-cleanup group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(contractPath)) {
      violations.push(`${externalReadinessPath}: no-go-cleanup group must include ${contractPath}`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
}
