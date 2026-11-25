export function createExternalBetaPlanPrinter({ contract, formatRequiredEnvAlternatives, formatOutputArtifacts }) {
  function printPlan(plan) {
    console.log(`External beta evidence plan (${contract.runnerId})`);
    console.log(`Mode: ${plan.mode}`);
    console.log(`Jobs: ${plan.jobCount}`);
    console.log(
      `Run policies: local=${plan.localContractJobCount}, live=${plan.liveCommandJobCount}, manual=${plan.manualArtifactJobCount}`,
    );
    console.log(`Executable live jobs: ${plan.executableLiveJobCount}`);
    console.log(`Live artifact ready jobs: ${plan.liveArtifactReadyForValidationJobCount}`);
    console.log(`External beta blocker jobs: ${plan.externalBlockerJobCount}`);
  
    for (const job of plan.jobs) {
      console.log('');
      console.log(`${job.jobId}`);
      console.log(`  group: ${job.evidenceGroupId}`);
      console.log(`  mode: ${job.mode}`);
      console.log(`  runPolicy: ${job.runPolicy}`);
      console.log(`  readiness: ${job.executionReadiness}`);
      console.log(`  owner: ${job.owner}`);
      console.log(`  runner: ${job.runnerCommand ?? 'manual artifact / validators only'}`);
      console.log(`  validators: ${job.validationCommands.join(' && ')}`);
      console.log(`  requiredEnv: ${job.requiredEnv.length === 0 ? 'none' : job.requiredEnv.join(', ')}`);
      console.log(`  requiredEnvAlternatives: ${formatRequiredEnvAlternatives(job)}`);
      console.log(`  optionalEnv: ${job.optionalEnv.length === 0 ? 'none' : job.optionalEnv.join(', ')}`);
      console.log(`  missingEnv: ${job.missingEnv.length === 0 ? 'none' : job.missingEnv.join(', ')}`);
      console.log(`  missingOptionalEnv: ${job.missingOptionalEnv.length === 0 ? 'none' : job.missingOptionalEnv.join(', ')}`);
      console.log(`  preflightViolations: ${job.preflightViolations.length === 0 ? 'none' : job.preflightViolations.join(' | ')}`);
      console.log(`  outputArtifacts: ${formatOutputArtifacts(job)}`);
      console.log(`  exit: ${job.exitCondition}`);
    }
  
    if (plan.missingEnvCount > 0) {
      console.log('');
      console.log(`Missing required env count: ${plan.missingEnvCount}`);
    }
    if (plan.missingOptionalEnvCount > 0) {
      console.log(`Missing optional env count: ${plan.missingOptionalEnvCount}`);
    }
  }

  return { printPlan };
}
