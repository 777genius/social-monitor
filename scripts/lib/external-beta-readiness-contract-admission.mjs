export function validateExternalBetaContractAdmission({ contract, contractPath, scripts, existsSync, violations }) {
  const requiredGoDecisionCriteriaFragments = new Set([
    'durable runtime proof',
    'live source provider certification',
    'credential and secret runtime flow',
    'RabbitMQ and Postgres staging drills',
    'backend durable E2E loop',
    'summary blocker feedback',
    'security final sweep',
    'release artifact evidence',
    'capacity envelope and no-go cleanup',
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

  if (contract.evidenceMode !== 'fixture_contract_with_external_evidence_required') {
    violations.push(`${contractPath}: evidenceMode must remain fixture_contract_with_external_evidence_required until live evidence exists`);
  }

  if (!['hold', 'go', 'rework'].includes(contract.externalBetaDecision)) {
    violations.push(`${contractPath}: externalBetaDecision must be hold, go or rework`);
  }

  validateGoDecisionExitCriteria();

  const evidenceRunner = contract.evidenceRunner;
  if (typeof evidenceRunner !== 'object' || evidenceRunner === null) {
    violations.push(`${contractPath}: evidenceRunner is required`);
  } else {
    if (!existsSync(evidenceRunner.contract ?? '')) {
      violations.push(`${contractPath}: evidenceRunner.contract must reference an existing contract`);
    }
    for (const field of [
      'checkCommand',
      'planCommand',
      'jsonPlanCommand',
      'summaryCommand',
      'preflightCommand',
      'artifactValidationCommand',
      'dockerBundleImportCommand',
      'currentPackageCommand',
    ]) {
      const scriptName = scriptNameFromNpmCommand(evidenceRunner[field]);
      if (scriptName === null || !scripts[scriptName]) {
        violations.push(`${contractPath}: evidenceRunner.${field} must reference an existing npm script`);
      }
    }
  }

  function validateGoDecisionExitCriteria() {
    if (!Array.isArray(contract.goDecisionExitCriteria) || contract.goDecisionExitCriteria.length === 0) {
      violations.push(`${contractPath}: goDecisionExitCriteria must list every blocking go prerequisite`);
      return;
    }

    const criteriaText = contract.goDecisionExitCriteria.join('\n').toLowerCase();
    for (const fragment of requiredGoDecisionCriteriaFragments) {
      if (!criteriaText.includes(fragment.toLowerCase())) {
        violations.push(`${contractPath}: goDecisionExitCriteria must include "${fragment}"`);
      }
    }
  }

  function scriptNameFromNpmCommand(command) {
    const match = /^npm run (?:--silent )?([^ ]+)/.exec(String(command ?? ''));
    return match?.[1] ?? null;
  }
}
