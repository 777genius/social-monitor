export function createExternalBetaJobReadiness({ process, localRuntimeEnvNames, isLocalRuntimeEnvValue }) {
  function missingRequiredEnv(job, options = {}) {
    const missingEnv = job.requiredEnv.filter((envName) => !hasEnv(envName));
    const coveredEnvNames = new Set(satisfiedRequiredEnvAlternatives(job, options).flatMap(requiredEnvAlternativeCoveredEnvNames));
    if (coveredEnvNames.size === 0) {
      return missingEnv;
    }

    return missingEnv.filter((envName) => !coveredEnvNames.has(envName));
  }

  function missingOptionalEnvNames(job) {
    return job.optionalEnv.filter((envName) => process.env[envName]?.trim() === undefined || process.env[envName]?.trim() === '');
  }

  function satisfiedRequiredEnvAlternatives(job, options = {}) {
    const allowCapturedArtifactAlternatives = options.allowCapturedArtifactAlternatives !== false;
    return (job.requiredEnvAlternatives ?? []).filter((alternative) => {
      if (alternative.mode === 'captured_artifact' && !allowCapturedArtifactAlternatives) {
        return false;
      }
      const envNames = alternative.env ?? [];
      return envNames.length > 0 && envNames.every((envName) => hasEnv(envName));
    });
  }

  function requiredEnvAlternativeCoveredEnvNames(alternative) {
    const coveredEnv = alternative.coversEnv ?? alternative.env ?? [];
    return Array.isArray(coveredEnv) ? coveredEnv : [];
  }

  function jobInputEnvNames(job) {
    return [
      ...(job.requiredEnv ?? []),
      ...(job.optionalEnv ?? []),
      ...(job.requiredEnvAlternatives ?? []).flatMap((alternative) => alternative.env ?? []),
    ];
  }

  function hasEnv(envName) {
    const value = process.env[envName]?.trim();
    return value !== undefined && value !== '';
  }

  function jobExecutionReadiness(job, missingEnv, preflightViolations) {
    if (missingEnv.length > 0) {
      return 'blocked_missing_required_env';
    }
    if (preflightViolations.length > 0) {
      if (hasOnlyLocalRuntimeEnvViolations(job, preflightViolations)) {
        return 'blocked_local_runtime_env';
      }
      return 'blocked_invalid_env';
    }
    if (job.runPolicy === 'manual_artifact_then_validator') {
      return 'manual_artifact_required';
    }
    if (job.runPolicy === 'live_command') {
      if (hasSatisfiedCapturedArtifactAlternative(job)) {
        return 'live_artifact_ready_for_validation';
      }
      return 'live_command_executable';
    }
    return 'local_contract_ready';
  }

  function hasSatisfiedCapturedArtifactAlternative(job) {
    return satisfiedRequiredEnvAlternatives(job)
      .some((alternative) => alternative.mode === 'captured_artifact');
  }

  function hasOnlyLocalRuntimeEnvViolations(job, preflightViolations) {
    if (!['live_network', 'staging_artifact', 'staging_deploy'].includes(job.mode)) {
      return false;
    }
    return preflightViolations.length > 0 && preflightViolations.every((violation) => {
      const envName = extractEnvNameFromPreflightViolation(violation);
      if (envName === undefined || !localRuntimeEnvNames().has(envName)) {
        return false;
      }
      const value = process.env[envName]?.trim();
      return value !== undefined && isLocalRuntimeEnvValue(value);
    });
  }

  function extractEnvNameFromPreflightViolation(violation) {
    return /: env ([A-Z][A-Z0-9_]*) /.exec(violation)?.[1];
  }

  function formatMissingRequiredEnvViolation(job, missingEnv, options = {}) {
    const base = `${job.jobId}: missing required env ${missingEnv.join(', ')}`;
    const alternatives = missingCoveringAlternatives(job, missingEnv, options);
    if (alternatives.length === 0) {
      return base;
    }

    return `${base}; satisfy one alternative: ${alternatives.map(formatRequiredEnvAlternative).join(' OR ')}`;
  }

  function missingCoveringAlternatives(job, missingEnv, options = {}) {
    const missingEnvSet = new Set(missingEnv);
    const allowCapturedArtifactAlternatives = options.allowCapturedArtifactAlternatives !== false;
    return (job.requiredEnvAlternatives ?? []).filter((alternative) => {
      if (alternative.mode === 'captured_artifact' && !allowCapturedArtifactAlternatives) {
        return false;
      }
      return requiredEnvAlternativeCoveredEnvNames(alternative).some((envName) => missingEnvSet.has(envName));
    });
  }

  function formatRequiredEnvAlternative(alternative) {
    const label = alternative.label ?? 'unnamed_alternative';
    const envNames = (alternative.env ?? []).join('+');
    return `${label}(${envNames})`;
  }

  return {
    missingRequiredEnv,
    missingOptionalEnvNames,
    requiredEnvAlternativeCoveredEnvNames,
    jobInputEnvNames,
    hasEnv,
    jobExecutionReadiness,
    formatMissingRequiredEnvViolation,
  };
}
