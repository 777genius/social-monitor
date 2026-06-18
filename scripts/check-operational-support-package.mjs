import { existsSync, readFileSync } from 'node:fs';

const contractPath = 'ops/release/operational-support-package.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const openApiPath = 'libs/contracts/rest/openapi.snapshot.json';
const supportSmokePath = 'scripts/check-beta-launch-support-rest-smoke.ts';

const contract = readJson(contractPath);
const packageJson = readJson(packagePath);
const dashboard = readJson(contract.dashboardArtifact);
const alerts = readJson(contract.alertArtifact);
const drills = readJson(contract.drillArtifact);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const openApi = readJson(openApiPath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:operational-support-package';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'operational-support-package';
const requiredFlowIds = new Set([
  'dlq-triage',
  'provider-outage',
  'provider-rate-limit',
  'summary-cost-spike',
  'delivery-failure-spike',
]);
const requiredGateCommands = new Set([
  'npm run check:observability',
  'npm run check:drills',
  'npm run check:beta-launch-support',
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

if (contract.externalBetaStatus !== 'contract_ready_pending_staging_evidence') {
  violations.push(`${contractPath}: externalBetaStatus must remain contract_ready_pending_staging_evidence`);
}

validateArtifacts();
validateSupportApi();
validateTriageFlows();
validateRequiredGateCommands();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Operational support package OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function validateArtifacts() {
  for (const path of [
    contract.dashboardArtifact,
    contract.alertArtifact,
    contract.drillArtifact,
    contract.runbook,
    openApiPath,
    supportSmokePath,
  ]) {
    if (typeof path !== 'string' || !existsSync(path)) {
      violations.push(`${contractPath}: required artifact does not exist "${path}"`);
    }
  }

  if (dashboard.dashboardId !== 'mvp-health') {
    violations.push(`${contract.dashboardArtifact}: dashboardId must be mvp-health`);
  }
  if (!Array.isArray(dashboard.panels) || dashboard.panels.length === 0) {
    violations.push(`${contract.dashboardArtifact}: panels must be non-empty`);
  }
  if (!Array.isArray(alerts.alerts) || alerts.alerts.length === 0) {
    violations.push(`${contract.alertArtifact}: alerts must be non-empty`);
  }
  if (!Array.isArray(drills.drills) || drills.drills.length === 0) {
    violations.push(`${contract.drillArtifact}: drills must be non-empty`);
  }
}

function validateSupportApi() {
  if (contract.supportApiSmoke !== 'npm run check:beta-launch-support') {
    violations.push(`${contractPath}: supportApiSmoke must be npm run check:beta-launch-support`);
  }
  if (!scripts['check:beta-launch-support']) {
    violations.push(`${packagePath}: missing check:beta-launch-support`);
  }

  const supportSmoke = readFileSync(supportSmokePath, 'utf8');
  for (const endpoint of contract.requiredSupportEndpoints ?? []) {
    if (!openApi.paths?.[endpoint]) {
      violations.push(`${openApiPath}: missing support endpoint "${endpoint}"`);
    }
    if (!supportSmoke.includes(endpoint)) {
      violations.push(`${supportSmokePath}: smoke must cover support endpoint "${endpoint}"`);
    }
  }
}

function validateTriageFlows() {
  const alertById = new Map((alerts.alerts ?? []).map((alert) => [alert.alertId, alert]));
  const panelById = new Map((dashboard.panels ?? []).map((panel) => [panel.panelId, panel]));
  const drillById = new Map((drills.drills ?? []).map((drill) => [drill.drillId, drill]));
  const runbook = readFileSync(contract.runbook, 'utf8').toLowerCase();
  const flowIds = new Set();

  for (const flow of contract.requiredTriageFlows ?? []) {
    if (flowIds.has(flow.flowId)) {
      violations.push(`${contractPath}: duplicate requiredTriageFlow "${flow.flowId}"`);
    }
    flowIds.add(flow.flowId);

    if (!requiredFlowIds.has(flow.flowId)) {
      violations.push(`${contractPath}: unsupported requiredTriageFlow "${flow.flowId}"`);
    }
    for (const field of ['owner', 'alertId', 'dashboardPanelId', 'drillId', 'runbookAnchor', 'firstMitigation']) {
      if (typeof flow[field] !== 'string' || flow[field].trim().length === 0) {
        violations.push(`${contractPath}: flow "${flow.flowId}" must define ${field}`);
      }
    }

    const alert = alertById.get(flow.alertId);
    const panel = panelById.get(flow.dashboardPanelId);
    const drill = drillById.get(flow.drillId);

    if (alert === undefined) {
      violations.push(`${contract.alertArtifact}: missing alert "${flow.alertId}" for flow "${flow.flowId}"`);
    } else {
      if (alert.dashboardId !== dashboard.dashboardId || alert.dashboardPanelId !== flow.dashboardPanelId) {
        violations.push(`${contract.alertArtifact}: alert "${flow.alertId}" must point to dashboard panel "${flow.dashboardPanelId}"`);
      }
      if (alert.firstMitigation !== flow.firstMitigation) {
        violations.push(`${contract.alertArtifact}: alert "${flow.alertId}" must use flow firstMitigation`);
      }
      if (!String(alert.runbook ?? '').endsWith(`#${flow.runbookAnchor}`)) {
        violations.push(`${contract.alertArtifact}: alert "${flow.alertId}" must point to runbook anchor "${flow.runbookAnchor}"`);
      }
      if (typeof alert.userVisibleState !== 'string' || alert.userVisibleState.trim().length === 0) {
        violations.push(`${contract.alertArtifact}: alert "${flow.alertId}" must expose userVisibleState`);
      }
    }

    if (panel === undefined) {
      violations.push(`${contract.dashboardArtifact}: missing panel "${flow.dashboardPanelId}" for flow "${flow.flowId}"`);
    } else if (
      typeof panel.safeDiagnosticQuestion !== 'string' ||
      panel.safeDiagnosticQuestion.trim().length === 0
    ) {
      violations.push(`${contract.dashboardArtifact}: panel "${flow.dashboardPanelId}" must define safeDiagnosticQuestion`);
    }

    if (drill === undefined) {
      violations.push(`${contract.drillArtifact}: missing drill "${flow.drillId}" for flow "${flow.flowId}"`);
    } else {
      if (drill.requiredAlertId !== flow.alertId) {
        violations.push(`${contract.drillArtifact}: drill "${flow.drillId}" must reference alert "${flow.alertId}"`);
      }
      if (!String(drill.runbook ?? '').endsWith(`#${flow.runbookAnchor}`)) {
        violations.push(`${contract.drillArtifact}: drill "${flow.drillId}" must point to runbook anchor "${flow.runbookAnchor}"`);
      }
      if (typeof drill.supportOutcome !== 'string' || drill.supportOutcome.trim().length === 0) {
        violations.push(`${contract.drillArtifact}: drill "${flow.drillId}" must define supportOutcome`);
      }
    }

    if (!runbook.includes(flow.runbookAnchor.replaceAll('-', ' '))) {
      violations.push(`${contract.runbook}: missing runbook anchor text for "${flow.runbookAnchor}"`);
    }
    validateSafeDiagnosticFields(flow);
  }

  for (const flowId of requiredFlowIds) {
    if (!flowIds.has(flowId)) {
      violations.push(`${contractPath}: missing required triage flow "${flowId}"`);
    }
  }
}

function validateSafeDiagnosticFields(flow) {
  const forbidden = new Set(contract.forbiddenDiagnosticFields ?? []);

  if (!Array.isArray(flow.safeDiagnosticFields) || flow.safeDiagnosticFields.length === 0) {
    violations.push(`${contractPath}: flow "${flow.flowId}" must define safeDiagnosticFields`);
    return;
  }

  for (const field of flow.safeDiagnosticFields) {
    const normalized = String(field).toLowerCase();
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      violations.push(`${contractPath}: unsafe diagnostic field "${field}" in flow "${flow.flowId}"`);
    }
    for (const forbiddenField of forbidden) {
      if (normalized.includes(String(forbiddenField).toLowerCase())) {
        violations.push(`${contractPath}: flow "${flow.flowId}" contains forbidden diagnostic field "${field}"`);
      }
    }
  }
}

function validateRequiredGateCommands() {
  for (const command of requiredGateCommands) {
    const scriptName = command.replace(/^npm run /, '');
    if (!scripts[scriptName]) {
      violations.push(`${packagePath}: missing support package prerequisite "${scriptName}"`);
    }
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const opsDomain = (backendOps.requiredDomains ?? []).find(
    (domain) => domain.domainId === 'observability-and-drills',
  );
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'operational-support-package',
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

  if (opsDomain === undefined) {
    violations.push(`${backendOpsPath}: missing observability-and-drills domain`);
  } else {
    if (!opsDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: observability-and-drills domain must include ${gateScript}`);
    }
    if (!opsDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: observability-and-drills domain must include ${gateId}`);
    }
    if (!opsDomain.artifacts?.includes(contractPath)) {
      violations.push(`${backendOpsPath}: observability-and-drills domain must include ${contractPath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing operational-support-package group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: operational-support-package group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(contractPath)) {
      violations.push(`${externalReadinessPath}: operational-support-package group must include ${contractPath}`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }
}
