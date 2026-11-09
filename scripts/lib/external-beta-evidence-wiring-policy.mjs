// Pure release-contract wiring validation; the caller owns all filesystem reads.
export function validateWiring({
  contract, contractPath, externalReadiness, externalReadinessPath,
  packageScripts, packagePath, backendScripts, backendSafePath,
  baselineScripts, baselineArtifacts, baselinePath,
  violations, scriptNameFromCommand,
}) {
  const checkScript = scriptNameFromCommand(contract.checkCommand);
  const planScript = scriptNameFromCommand(contract.planCommand);
  const jsonPlanScript = scriptNameFromCommand(contract.jsonPlanCommand);
  const summaryScript = scriptNameFromCommand(contract.summaryCommand);
  const handoffScript = scriptNameFromCommand(contract.handoffCommand);
  const handoffJsonScript = scriptNameFromCommand(contract.handoffJsonCommand);
  const preflightScript = scriptNameFromCommand(contract.preflightCommand);
  const artifactValidationScript = scriptNameFromCommand(contract.artifactValidationCommand);
  const currentPackageScript = scriptNameFromCommand(contract.currentPackageCommand);
  const executeScript = scriptNameFromCommand(contract.executeCommand);

  for (const scriptName of [
    checkScript,
    planScript,
    jsonPlanScript,
    summaryScript,
    handoffScript,
    handoffJsonScript,
    preflightScript,
    artifactValidationScript,
    currentPackageScript,
    executeScript,
  ]) {
    if (!packageScripts[scriptName]) {
      violations.push(`${packagePath}: missing npm script "${scriptName}"`);
    }
  }
  if (!String(packageScripts[jsonPlanScript] ?? '').includes('--json')) {
    violations.push(`${packagePath}: ${jsonPlanScript} must pass --json`);
  }
  if (!String(packageScripts[summaryScript] ?? '').includes('--summary')) {
    violations.push(`${packagePath}: ${summaryScript} must pass --summary`);
  }
  if (!String(packageScripts[handoffScript] ?? '').includes('--handoff')) {
    violations.push(`${packagePath}: ${handoffScript} must pass --handoff`);
  }
  if (!String(packageScripts[handoffJsonScript] ?? '').includes('--handoff-json')) {
    violations.push(`${packagePath}: ${handoffJsonScript} must pass --handoff-json`);
  }
  if (!String(packageScripts[preflightScript] ?? '').includes('--require-env')) {
    violations.push(`${packagePath}: ${preflightScript} must pass --require-env`);
  }
  if (!String(packageScripts[artifactValidationScript] ?? '').includes('--validate-artifacts')) {
    violations.push(`${packagePath}: ${artifactValidationScript} must pass --validate-artifacts`);
  }
  if (!String(packageScripts[artifactValidationScript] ?? '').includes('--require-env')) {
    violations.push(`${packagePath}: ${artifactValidationScript} must pass --require-env`);
  }
  if (packageScripts[currentPackageScript] !== 'node scripts/package-current-external-beta-evidence.mjs') {
    violations.push(`${packagePath}: ${currentPackageScript} must run scripts/package-current-external-beta-evidence.mjs`);
  }
  if (!backendScripts.has(checkScript)) {
    violations.push(`${backendSafePath}: backendScripts must include ${checkScript}`);
  }
  for (const scriptName of [
    planScript,
    jsonPlanScript,
    summaryScript,
    handoffScript,
    handoffJsonScript,
    preflightScript,
    artifactValidationScript,
    currentPackageScript,
    executeScript,
  ]) {
    if (backendScripts.has(scriptName)) {
      violations.push(`${backendSafePath}: backend-safe verify must not run ${scriptName}`);
    }
  }
  if (!baselineScripts.has(checkScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${checkScript}`);
  }
  if (!baselineArtifacts.has(contractPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${contractPath}`);
  }

  const evidenceRunner = externalReadiness.evidenceRunner;
  if (typeof evidenceRunner !== 'object' || evidenceRunner === null) {
    violations.push(`${externalReadinessPath}: evidenceRunner is required`);
    return;
  }
  if (evidenceRunner.contract !== contractPath) {
    violations.push(`${externalReadinessPath}: evidenceRunner.contract must be ${contractPath}`);
  }
  if (evidenceRunner.checkCommand !== contract.checkCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.checkCommand must match runner contract`);
  }
  if (evidenceRunner.planCommand !== contract.planCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.planCommand must match runner contract`);
  }
  if (evidenceRunner.jsonPlanCommand !== contract.jsonPlanCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.jsonPlanCommand must match runner contract`);
  }
  if (evidenceRunner.summaryCommand !== contract.summaryCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.summaryCommand must match runner contract`);
  }
  if (evidenceRunner.handoffCommand !== contract.handoffCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.handoffCommand must match runner contract`);
  }
  if (evidenceRunner.handoffJsonCommand !== contract.handoffJsonCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.handoffJsonCommand must match runner contract`);
  }
  if (evidenceRunner.preflightCommand !== contract.preflightCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.preflightCommand must match runner contract`);
  }
  if (evidenceRunner.artifactValidationCommand !== contract.artifactValidationCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.artifactValidationCommand must match runner contract`);
  }
  if (evidenceRunner.dockerBundleImportCommand !== contract.dockerBundleImportCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.dockerBundleImportCommand must match runner contract`);
  }
  if (evidenceRunner.currentPackageCommand !== contract.currentPackageCommand) {
    violations.push(`${externalReadinessPath}: evidenceRunner.currentPackageCommand must match runner contract`);
  }
}
