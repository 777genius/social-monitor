// Builds the existing JSON handoff without reading files or environment values.
// Dependency callbacks intentionally read current state only when the CLI calls this function.
export function buildExternalBetaHandoff(plan, {
  contract,
  inputMatrix,
  evidencePathMaxBytes,
  handoffRunner,
  handoffAction,
  hasEnv,
  inputMetadataByEnv,
  artifactExamplePathByFormat,
  requiredEnvAlternativeCoveredEnvNames,
}) {
  function buildHandoffInputs(job, envNames, missingEnvNames) {
    const missingEnv = new Set(missingEnvNames ?? []);
    return (envNames ?? []).map((envName) => {
      const metadata = inputMetadataByEnv().get(envName) ?? {};
      return {
        env: envName,
        inputClass: metadata.inputClass ?? 'unclassified',
        description: metadata.description ?? null,
        missing: missingEnv.has(envName),
        artifacts: buildHandoffEnvArtifacts(job, envName),
      };
    });
  }

  function buildHandoffAlternativeInputs(job) {
    return (job.requiredEnvAlternatives ?? []).map((alternative) => ({
      label: alternative.label ?? null,
      coversEnv: requiredEnvAlternativeCoveredEnvNames(alternative),
      inputs: buildHandoffInputs(job, alternative.env ?? [], missingAlternativeEnvNames(alternative)),
    }));
  }

  function missingAlternativeEnvNames(alternative) {
    return (alternative.env ?? []).filter((envName) => !hasEnv(envName));
  }

  function buildHandoffEnvArtifacts(job, envName) {
    return (job.outputArtifacts ?? [])
      .filter((artifact) => artifact.env === envName)
      .map((artifact) => {
        const examplePath = artifactExamplePathByFormat().get(artifact.format) ?? null;
        return {
          format: artifact.format,
          examplePath,
          expectedArtifactId: artifact.expectedArtifactId ?? null,
          expectedProviderKeys: artifact.expectedProviderKeys ?? [],
        };
      });
  }

  function buildHandoffArtifactContracts(job) {
    return job.outputArtifacts.map((artifact) => {
      const examplePath = artifactExamplePathByFormat().get(artifact.format) ?? null;
      return {
        path: artifact.path ?? null,
        env: artifact.env ?? null,
        location: artifact.path ?? `<env:${artifact.env}>`,
        format: artifact.format,
        examplePath,
        expectedArtifactId: artifact.expectedArtifactId ?? null,
        expectedProviderKeys: artifact.expectedProviderKeys ?? [],
      };
    });
  }

  return {
    runnerId: contract.runnerId,
    scope: contract.scope,
    frontendPolicy: contract.frontendPolicy,
    defaultMode: contract.defaultMode,
    envTemplate: contract.envExample,
    inputMatrix: {
      matrixId: inputMatrix.matrixId,
      checkCommand: inputMatrix.checkCommand,
      secretValuePolicy: inputMatrix.secretValuePolicy,
      artifactPathPolicy: inputMatrix.artifactPathPolicy,
    },
    safety: {
      inspectPlanCommand: contract.planCommand,
      inspectSummaryCommand: contract.summaryCommand,
      handoffCommand: contract.handoffCommand,
      handoffJsonCommand: contract.handoffJsonCommand,
      preflightCommand: contract.preflightCommand,
      artifactValidationCommand: contract.artifactValidationCommand,
      dockerBundleImportCommand: contract.dockerBundleImportCommand,
      currentPackageCommand: contract.currentPackageCommand,
      envFileArg: contract.executionSafety.envFileArg,
      envFileConflictPolicy: contract.executionSafety.envFileConflictPolicy,
      liveExecutionRequires: contract.executionSafety.liveExecutionRequires,
      evidencePathMaxBytes: evidencePathMaxBytes(),
      envValuePolicy: 'names_only',
      evidencePathPolicy: inputMatrix.artifactPathPolicy,
    },
    readiness: {
      localContractJobs: plan.localContractJobCount,
      totalJobs: plan.jobCount,
      contractClosurePercent: plan.contractClosurePercent,
      externalEvidenceReadyJobs: plan.executableLiveJobCount + plan.liveArtifactReadyForValidationJobCount + plan.manualArtifactReadyForValidationJobCount,
      externalEvidenceTotalJobs: plan.liveCommandJobCount + plan.manualArtifactJobCount,
      externalEvidenceEnvReadinessPercent: plan.externalEvidenceEnvReadinessPercent,
      liveArtifactReadyForValidationJobCount: plan.liveArtifactReadyForValidationJobCount,
      externalBlockerJobCount: plan.externalBlockerJobCount,
      blockedMissingRequiredEnvJobCount: plan.blockedMissingRequiredEnvJobCount,
      blockedInvalidInputJobCount: plan.blockedInvalidInputJobCount,
      blockedLocalRuntimeEnvJobCount: plan.blockedLocalRuntimeEnvJobCount,
      readinessCounts: plan.readinessCounts,
      uniqueMissingEnv: plan.uniqueMissingEnv,
      uniqueMissingOptionalEnv: plan.uniqueMissingOptionalEnv,
    },
    jobs: plan.jobs.map((job) => ({
      jobId: job.jobId,
      evidenceGroupId: job.evidenceGroupId,
      mode: job.mode,
      runPolicy: job.runPolicy,
      owner: job.owner,
      blocksExternalBeta: job.blocksExternalBeta,
      executionReadiness: job.executionReadiness,
      runnerCommand: job.runnerCommand,
      runnerDescription: handoffRunner(job),
      validationCommands: job.validationCommands,
      requiredEnv: job.requiredEnv,
      requiredEnvAlternatives: job.requiredEnvAlternatives ?? [],
      optionalEnv: job.optionalEnv,
      missingEnv: job.missingEnv,
      missingOptionalEnv: job.missingOptionalEnv,
      requiredInputs: buildHandoffInputs(job, job.requiredEnv, job.missingEnv),
      requiredAlternativeInputs: buildHandoffAlternativeInputs(job),
      optionalInputs: buildHandoffInputs(job, job.optionalEnv, job.missingOptionalEnv),
      preflightViolations: job.preflightViolations,
      outputArtifacts: buildHandoffArtifactContracts(job),
      operatorAction: handoffAction(job),
      exitCondition: job.exitCondition,
    })),
  };
}
