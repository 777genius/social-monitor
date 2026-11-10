/** Pure plan aggregation; the CLI supplies environment-sensitive policies at call time. */
export function buildExternalBetaPlan(planJobs, {
  runnerId,
  mode,
  duplicateEvidencePathViolationsByJob,
  missingRequiredEnv,
  missingOptionalEnvNames,
  jobPreflightViolations,
  jobExecutionReadiness,
  percent,
}) {
  const duplicatePreflightViolationsByJob = duplicateEvidencePathViolationsByJob(planJobs);
  const plan = {
    runnerId,
    mode,
    jobCount: planJobs.length,
    localContractJobCount: 0,
    liveCommandJobCount: 0,
    manualArtifactJobCount: 0,
    executableLiveJobCount: 0,
    liveArtifactReadyForValidationJobCount: 0,
    externalBlockerJobCount: 0,
    missingEnvCount: 0,
    missingOptionalEnvCount: 0,
    readinessCounts: {},
    contractClosurePercent: 0,
    externalEvidenceEnvReadinessPercent: 0,
    manualArtifactReadyForValidationJobCount: 0,
    blockedMissingRequiredEnvJobCount: 0,
    blockedInvalidInputJobCount: 0,
    blockedLocalRuntimeEnvJobCount: 0,
    uniqueMissingEnv: [],
    uniqueMissingOptionalEnv: [],
    jobs: [],
  };

  for (const job of planJobs) {
    const missingEnv = missingRequiredEnv(job);
    const missingOptionalEnv = missingOptionalEnvNames(job);
    const preflightViolations = [
      ...jobPreflightViolations(job, new Set(missingEnv)),
      ...(duplicatePreflightViolationsByJob.get(job.jobId) ?? []),
    ];
    const executionReadiness = jobExecutionReadiness(job, missingEnv, preflightViolations);
    plan.readinessCounts[executionReadiness] = (plan.readinessCounts[executionReadiness] ?? 0) + 1;
    plan.jobs.push({
      jobId: job.jobId,
      evidenceGroupId: job.evidenceGroupId,
      mode: job.mode,
      runPolicy: job.runPolicy,
      owner: job.owner,
      blocksExternalBeta: job.blocksExternalBeta,
      executionReadiness,
      runnerCommand: job.runnerCommand,
      runnerDescription: job.runnerDescription,
      operatorAction: job.operatorAction,
      validationCommands: job.validationCommands,
      requiredEnv: job.requiredEnv,
      requiredEnvAlternatives: job.requiredEnvAlternatives ?? [],
      optionalEnv: job.optionalEnv,
      missingEnv,
      missingOptionalEnv,
      preflightViolations,
      outputArtifacts: job.outputArtifacts,
      exitCondition: job.exitCondition,
    });
    plan.missingEnvCount += missingEnv.length;
    plan.missingOptionalEnvCount += missingOptionalEnv.length;
    if (job.runPolicy === 'local_contract') {
      plan.localContractJobCount += 1;
    }
    if (job.runPolicy === 'live_command') {
      plan.liveCommandJobCount += 1;
      if (executionReadiness === 'live_command_executable') {
        plan.executableLiveJobCount += 1;
      }
      if (executionReadiness === 'live_artifact_ready_for_validation') {
        plan.liveArtifactReadyForValidationJobCount += 1;
      }
    }
    if (job.runPolicy === 'manual_artifact_then_validator') {
      plan.manualArtifactJobCount += 1;
      if (executionReadiness === 'manual_artifact_required') {
        plan.manualArtifactReadyForValidationJobCount += 1;
      }
    }
    if (job.blocksExternalBeta === true) {
      plan.externalBlockerJobCount += 1;
    }
    if (executionReadiness === 'blocked_missing_required_env') {
      plan.blockedMissingRequiredEnvJobCount += 1;
    }
    if (executionReadiness === 'blocked_invalid_env') {
      plan.blockedInvalidInputJobCount += 1;
    }
    if (executionReadiness === 'blocked_local_runtime_env') {
      plan.blockedLocalRuntimeEnvJobCount += 1;
    }
  }
  plan.uniqueMissingEnv = [...new Set(plan.jobs.flatMap((job) => job.missingEnv))].sort();
  plan.uniqueMissingOptionalEnv = [...new Set(plan.jobs.flatMap((job) => job.missingOptionalEnv))].sort();
  plan.contractClosurePercent = percent(plan.localContractJobCount, plan.jobCount);
  plan.externalEvidenceEnvReadinessPercent = percent(
    plan.executableLiveJobCount + plan.liveArtifactReadyForValidationJobCount + plan.manualArtifactReadyForValidationJobCount,
    plan.liveCommandJobCount + plan.manualArtifactJobCount,
  );

  return plan;
}
