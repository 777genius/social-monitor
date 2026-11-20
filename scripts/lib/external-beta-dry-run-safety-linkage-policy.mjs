// Preserve original external-beta execution safety and readiness linkage admission, including diagnostic order.
export function createExternalBetaDryRunSafetyLinkagePolicy(dependencies) {
  for (const name of [
    'runner', 'dryRun', 'readiness', 'runnerPath', 'dryRunPath', 'readinessPath', 'violations',
  ]) {
    const value = dependencies?.[name];
    if (value === null || value === undefined) {
      throw new TypeError('external beta dry-run safety linkage policy requires ' + name);
    }
  }
  const { runner, dryRun, readiness, runnerPath, dryRunPath, readinessPath, violations } = dependencies;

  function validateRunnerSafety() {
    const safety = runner.executionSafety ?? {};
    for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
      if (!safety.forbiddenTargets?.includes(forbiddenTarget)) {
        violations.push(`${runnerPath}: executionSafety.forbiddenTargets must include ${forbiddenTarget}`);
      }
    }

    const dryRunCommandText = [
      dryRun.checkCommand,
      dryRun.planJsonCommand,
      dryRun.handoffCommand,
      dryRun.handoffJsonCommand,
      dryRun.summaryCommand,
      dryRun.preflightCommand,
      dryRun.artifactValidationCommand,
      dryRun.currentPackageCommand,
      dryRun.liveExecutionTemplate,
    ].join('\n').toLowerCase();
    for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
      if (dryRunCommandText.includes(forbiddenTarget)) {
        violations.push(`${dryRunPath}: dry-run commands must not target ${forbiddenTarget}`);
      }
    }

    for (const job of runner.jobs ?? []) {
      if (job.blocksExternalBeta !== true) {
        violations.push(`${runnerPath}: ${job.jobId} must block external beta`);
      }
      for (const command of [job.runnerCommand, ...(job.validationCommands ?? [])]) {
        if (typeof command !== 'string') {
          continue;
        }
        for (const forbiddenTarget of dryRun.forbiddenTargets ?? []) {
          if (command.toLowerCase().includes(forbiddenTarget)) {
            violations.push(`${runnerPath}: ${job.jobId} command must not target ${forbiddenTarget}: ${command}`);
          }
        }
      }
    }
  }

  function validateReadinessLinkage() {
    if (readiness.externalBetaDecision !== 'hold') {
      violations.push(`${readinessPath}: externalBetaDecision must stay hold until live evidence is attached`);
    }
    if (readiness.evidenceMode !== 'fixture_contract_with_external_evidence_required') {
      violations.push(`${readinessPath}: evidenceMode must require external evidence`);
    }
    const readinessRunner = readiness.evidenceRunner ?? {};
    if (readinessRunner.contract !== runnerPath) {
      violations.push(`${readinessPath}: evidenceRunner.contract must point at ${runnerPath}`);
    }
    if (readinessRunner.jsonPlanCommand !== dryRun.planJsonCommand) {
      violations.push(`${readinessPath}: evidenceRunner.jsonPlanCommand must match dry-run plan command`);
    }
    if (readinessRunner.handoffJsonCommand !== dryRun.handoffJsonCommand) {
      violations.push(`${readinessPath}: evidenceRunner.handoffJsonCommand must match dry-run JSON handoff command`);
    }
    if (readinessRunner.currentPackageCommand !== dryRun.currentPackageCommand) {
      violations.push(`${readinessPath}: evidenceRunner.currentPackageCommand must match dry-run current package command`);
    }
  }

  return { validateRunnerSafety, validateReadinessLinkage };
}
