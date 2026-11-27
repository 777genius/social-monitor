import { validateUniqueExternalBetaDryRunJobIds } from './external-beta-dry-run-job-identity.mjs';

// Preserve the legacy JSON handoff admission contract and its diagnostic ordering.
export function createExternalBetaDryRunHandoffPolicy(dependencies) {
  for (const name of [
    'handoff', 'runner', 'dryRun', 'dryRunPath', 'runnerPath', 'plan', 'violations', 'assertSameSet',
  ]) {
    const dependency = dependencies?.[name];
    if (dependency === null || dependency === undefined) {
      throw new TypeError(`external beta dry-run handoff policy requires ${name}`);
    }
  }
  const {
    handoff, runner, dryRun, dryRunPath, runnerPath, plan, violations, assertSameSet,
  } = dependencies;
  if (typeof assertSameSet !== 'function') {
    throw new TypeError('external beta dry-run handoff policy requires assertSameSet to be a function');
  }
  function validateHandoffShape() {
    if (handoff.runnerId !== runner.runnerId) {
      violations.push(`${dryRunPath}: JSON handoff runnerId must match ${runnerPath}`);
    }
    if (handoff.scope !== dryRun.scope) {
      violations.push(`${dryRunPath}: JSON handoff scope must match dry-run scope`);
    }
    if (handoff.frontendPolicy !== dryRun.frontendPolicy) {
      violations.push(`${dryRunPath}: JSON handoff frontendPolicy must match dry-run frontendPolicy`);
    }
    if (handoff.envTemplate !== dryRun.envExample) {
      violations.push(`${dryRunPath}: JSON handoff envTemplate must match dry-run envExample`);
    }
    if (handoff.inputMatrix?.matrixId !== 'external-beta-evidence-input-matrix-v1') {
      violations.push(`${dryRunPath}: JSON handoff must expose external beta evidence input matrix id`);
    }
    if (handoff.inputMatrix?.secretValuePolicy !== 'never_commit_values') {
      violations.push(`${dryRunPath}: JSON handoff input matrix must preserve secret value policy`);
    }
    if (handoff.inputMatrix?.artifactPathPolicy !== 'absolute_json_private_0600_non_workspace_non_fixture_path') {
      violations.push(`${dryRunPath}: JSON handoff input matrix must preserve artifact path policy`);
    }
    if (handoff.safety?.handoffJsonCommand !== dryRun.handoffJsonCommand) {
      violations.push(`${dryRunPath}: JSON handoff must expose the dry-run JSON handoff command`);
    }
    if (handoff.safety?.currentPackageCommand !== dryRun.currentPackageCommand) {
      violations.push(`${dryRunPath}: JSON handoff must expose the current evidence package command`);
    }
    if (handoff.safety?.envValuePolicy !== 'names_only') {
      violations.push(`${dryRunPath}: JSON handoff safety.envValuePolicy must be names_only`);
    }
    if (handoff.safety?.evidencePathPolicy !== 'absolute_json_private_0600_non_workspace_non_fixture_path') {
      violations.push(`${dryRunPath}: JSON handoff must preserve evidence path safety policy`);
    }

    const readiness = handoff.readiness ?? {};
    const expectedReadiness = {
      localContractJobs: plan.localContractJobCount,
      totalJobs: plan.jobCount,
      contractClosurePercent: plan.contractClosurePercent,
      externalEvidenceReadyJobs: plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount,
      externalEvidenceTotalJobs: plan.liveCommandJobCount + plan.manualArtifactJobCount,
      externalEvidenceEnvReadinessPercent: plan.externalEvidenceEnvReadinessPercent,
      externalBlockerJobCount: plan.externalBlockerJobCount,
      blockedMissingRequiredEnvJobCount: plan.blockedMissingRequiredEnvJobCount,
      blockedInvalidInputJobCount: plan.blockedInvalidInputJobCount,
      blockedLocalRuntimeEnvJobCount: plan.blockedLocalRuntimeEnvJobCount,
    };
    for (const [field, expectedValue] of Object.entries(expectedReadiness)) {
      if (readiness[field] !== expectedValue) {
        violations.push(`${dryRunPath}: JSON handoff readiness.${field} must be ${expectedValue}, got ${readiness[field]}`);
      }
    }
    assertSameSet(readiness.uniqueMissingEnv ?? [], plan.uniqueMissingEnv ?? [], `${dryRunPath}: JSON handoff uniqueMissingEnv`);
    assertSameSet(
      readiness.uniqueMissingOptionalEnv ?? [],
      plan.uniqueMissingOptionalEnv ?? [],
      `${dryRunPath}: JSON handoff uniqueMissingOptionalEnv`,
    );

    assertSameSet(handoff.jobs?.map((job) => job.jobId) ?? [], dryRun.requiredJobIds ?? [], `${dryRunPath}: JSON handoff jobs`);
    validateUniqueExternalBetaDryRunJobIds(handoff.jobs, `${dryRunPath}: JSON handoff jobs`, violations);
    const handoffJobsById = new Map((handoff.jobs ?? []).map((job) => [job.jobId, job]));
    const planJobsById = new Map((plan.jobs ?? []).map((job) => [job.jobId, job]));
    for (const jobId of dryRun.requiredJobIds ?? []) {
      const handoffJob = handoffJobsById.get(jobId);
      const planJob = planJobsById.get(jobId);
      if (handoffJob === undefined || planJob === undefined) {
        continue;
      }
      if (handoffJob.executionReadiness !== planJob.executionReadiness) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} readiness must match plan`);
      }
      if (typeof handoffJob.operatorAction !== 'string' || handoffJob.operatorAction.trim().length === 0) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} must include operatorAction`);
      }
      if (!Array.isArray(handoffJob.outputArtifacts) || handoffJob.outputArtifacts.length === 0) {
        violations.push(`${dryRunPath}: JSON handoff ${jobId} must include outputArtifacts`);
      }
      assertSameSet(
        handoffJob.requiredInputs?.map((input) => input.env) ?? [],
        handoffJob.requiredEnv ?? [],
        `${dryRunPath}: JSON handoff ${jobId} requiredInputs`,
      );
      assertSameSet(
        handoffJob.optionalInputs?.map((input) => input.env) ?? [],
        handoffJob.optionalEnv ?? [],
        `${dryRunPath}: JSON handoff ${jobId} optionalInputs`,
      );
      for (const input of [...(handoffJob.requiredInputs ?? []), ...(handoffJob.optionalInputs ?? [])]) {
        if (typeof input.inputClass !== 'string' || input.inputClass === 'unclassified') {
          violations.push(`${dryRunPath}: JSON handoff ${jobId} input ${input.env} must include matrix inputClass`);
        }
        if (typeof input.description !== 'string' || input.description.trim().length === 0) {
          violations.push(`${dryRunPath}: JSON handoff ${jobId} input ${input.env} must include matrix description`);
        }
      }
      for (const artifact of handoffJob.outputArtifacts ?? []) {
        if (artifact.env !== null && !String(artifact.location).startsWith('<env:')) {
          violations.push(`${dryRunPath}: JSON handoff ${jobId} env artifact must use env-only location`);
        }
        if (artifact.env !== null && artifact.examplePath === null) {
          violations.push(`${dryRunPath}: JSON handoff ${jobId} env artifact ${artifact.env} must include fixture example path`);
        }
      }
    }
  }

  return { validateHandoffShape };
}
