import { validateUniqueExternalBetaDryRunJobIds } from './external-beta-dry-run-job-identity.mjs';

export function createExternalBetaDryRunPlanPolicy(dependencies) {
  for (const name of [
    'dryRun', 'runner', 'plan', 'dryRunPath', 'runnerPath', 'existsSync', 'assertSameSet', 'violations',
  ]) {
    const dependency = dependencies?.[name];
    if (dependency === null || dependency === undefined) {
      throw new TypeError(`external beta dry-run plan policy requires ${name}`);
    }
  }
  const {
    dryRun, runner, plan, dryRunPath, runnerPath, existsSync, assertSameSet, violations,
  } = dependencies;
  for (const name of ['existsSync', 'assertSameSet']) {
    if (typeof dependencies[name] !== 'function') {
      throw new TypeError(`external beta dry-run plan policy requires ${name} to be a function`);
    }
  }
  for (const name of ['dryRun', 'runner', 'plan']) {
    if (typeof dependencies[name] !== 'object' || Array.isArray(dependencies[name])) {
      throw new TypeError(`external beta dry-run plan policy requires ${name} to be an object`);
    }
  }
  for (const name of ['dryRunPath', 'runnerPath']) {
    if (typeof dependencies[name] !== 'string') {
      throw new TypeError(`external beta dry-run plan policy requires ${name} to be a string`);
    }
  }
  if (!Array.isArray(violations)) {
    throw new TypeError('external beta dry-run plan policy requires violations to be an array');
  }
  function validateDryRunContract() {
    if (dryRun.schemaVersion !== 1) {
      violations.push(`${dryRunPath}: schemaVersion must be 1`);
    }
    if (dryRun.scope !== 'backend-only') {
      violations.push(`${dryRunPath}: scope must be backend-only`);
    }
    if (dryRun.frontendPolicy !== 'deferred_contract_only') {
      violations.push(`${dryRunPath}: frontendPolicy must keep frontend deferred`);
    }
    if (dryRun.defaultMode !== 'plan_only') {
      violations.push(`${dryRunPath}: defaultMode must be plan_only`);
    }
    if (dryRun.notEvidence !== true) {
      violations.push(`${dryRunPath}: notEvidence must be true`);
    }
    if (dryRun.doesNotUnblockExternalBeta !== true) {
      violations.push(`${dryRunPath}: doesNotUnblockExternalBeta must be true`);
    }

    for (const path of [dryRun.sourceRunnerContract, dryRun.sourceReadinessContract, dryRun.envExample]) {
      if (!existsSync(path ?? '')) {
        violations.push(`${dryRunPath}: referenced file must exist: ${path}`);
      }
    }

    const commandPairs = [
      ['planJsonCommand', 'jsonPlanCommand'],
      ['handoffCommand', 'handoffCommand'],
      ['handoffJsonCommand', 'handoffJsonCommand'],
      ['summaryCommand', 'summaryCommand'],
      ['preflightCommand', 'preflightCommand'],
      ['artifactValidationCommand', 'artifactValidationCommand'],
      ['currentPackageCommand', 'currentPackageCommand'],
    ];
    for (const [dryRunField, runnerField] of commandPairs) {
      if (dryRun[dryRunField] !== runner[runnerField]) {
        violations.push(`${dryRunPath}: ${dryRunField} must match runner ${runnerField}`);
      }
    }

    if (!String(dryRun.liveExecutionTemplate).includes('EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live')) {
      violations.push(`${dryRunPath}: liveExecutionTemplate must include explicit live confirmation`);
    }
    if (!String(dryRun.liveExecutionTemplate).includes('--execute')) {
      violations.push(`${dryRunPath}: liveExecutionTemplate must include --execute`);
    }
    if (String(dryRun.planJsonCommand).includes('--execute')) {
      violations.push(`${dryRunPath}: planJsonCommand must not execute live jobs`);
    }
  }

  function validatePlanShape() {
    if (plan.runnerId !== runner.runnerId) {
      violations.push(`${dryRunPath}: plan runnerId must match ${runnerPath}`);
    }
    if (plan.mode !== 'plan_only') {
      violations.push(`${dryRunPath}: clean-env plan must stay plan_only`);
    }

    const expectedCounts = dryRun.expectedPlanCountsWithoutCredentials ?? {};
    for (const [field, expectedValue] of Object.entries(expectedCounts)) {
      if (plan[field] !== expectedValue) {
        violations.push(`${dryRunPath}: clean-env plan ${field} must be ${expectedValue}, got ${plan[field]}`);
      }
    }

    assertSameSet(plan.jobs?.map((job) => job.jobId) ?? [], dryRun.requiredJobIds ?? [], `${dryRunPath}: requiredJobIds`);
    validateUniqueExternalBetaDryRunJobIds(plan.jobs, `${dryRunPath}: plan jobs`, violations);
    assertSameSet(plan.uniqueMissingEnv ?? [], dryRun.requiredMissingEnvWithoutCredentials ?? [], `${dryRunPath}: requiredMissingEnvWithoutCredentials`);
    assertSameSet(
      Object.keys(plan.readinessCounts ?? {}),
      dryRun.requiredReadinessStatesWithoutCredentials ?? [],
      `${dryRunPath}: requiredReadinessStatesWithoutCredentials`,
    );

    for (const job of plan.jobs ?? []) {
      if (job.blocksExternalBeta !== true) {
        violations.push(`${dryRunPath}: ${job.jobId} must remain an external beta blocker`);
      }
      if (typeof job.owner !== 'string' || job.owner.trim().length === 0) {
        violations.push(`${dryRunPath}: ${job.jobId} must define owner`);
      }
      if (typeof job.exitCondition !== 'string' || job.exitCondition.trim().length === 0) {
        violations.push(`${dryRunPath}: ${job.jobId} must define exitCondition`);
      }
      if (!Array.isArray(job.validationCommands) || job.validationCommands.length === 0) {
        violations.push(`${dryRunPath}: ${job.jobId} must define validationCommands`);
      }
      if (job.runPolicy === 'local_contract' && job.executionReadiness !== 'local_contract_ready') {
        violations.push(`${dryRunPath}: ${job.jobId} local contract must stay local_contract_ready in clean env`);
      }
      if (job.runPolicy !== 'local_contract' && job.executionReadiness !== 'blocked_missing_required_env') {
        violations.push(`${dryRunPath}: ${job.jobId} external evidence job must stay blocked without credentials`);
      }
      if (job.runPolicy === 'live_command' && typeof job.runnerCommand !== 'string') {
        violations.push(`${dryRunPath}: ${job.jobId} live command job must expose runnerCommand`);
      }
      if (job.runPolicy === 'manual_artifact_then_validator' && job.runnerCommand !== null) {
        violations.push(`${dryRunPath}: ${job.jobId} manual artifact job must not expose runnerCommand`);
      }
    }
  }

  return { validateDryRunContract, validatePlanShape };
}
