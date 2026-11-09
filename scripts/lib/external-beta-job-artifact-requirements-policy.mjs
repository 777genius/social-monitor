// The checker owns contract I/O and supplies its path and command readers as ports.
// Keep original artifact and evidence requirements together without module-level effects.
export function createExternalBetaJobArtifactRequirementsPolicy({
  violations, requiredJobEnvNames, requiredJobOptionalEnvNames,
  requiredJobEnvAlternatives, requiredJobOutputArtifacts,
  existsSync, validationCommandSource,
}) {
  function validateJobArtifacts(job, label) {
    if (!Array.isArray(job.outputArtifacts) || job.outputArtifacts.length === 0) {
      violations.push(`${label}: outputArtifacts must be non-empty`);
      return;
    }

    const envNames = new Set([...(Array.isArray(job.requiredEnv) ? job.requiredEnv : []), ...(Array.isArray(job.optionalEnv) ? job.optionalEnv : [])]);
    for (const artifact of job.outputArtifacts) {
      if (typeof artifact.format !== 'string' || artifact.format.trim().length === 0) {
        violations.push(`${label}: output artifact must define format`);
      }
      if (artifact.path === undefined && artifact.env === undefined) {
        violations.push(`${label}: output artifact must define path or env`);
      }
      if (artifact.path !== undefined && !existsSync(artifact.path)) {
        violations.push(`${label}: output artifact path must exist: ${artifact.path}`);
      }
      if (artifact.env !== undefined && !envNames.has(artifact.env)) {
        violations.push(`${label}: output artifact env "${artifact.env}" must be listed in requiredEnv or optionalEnv`);
      }
      if (
        artifact.expectedArtifactId !== undefined
        && (typeof artifact.expectedArtifactId !== 'string' || artifact.expectedArtifactId.trim().length === 0)
      ) {
        violations.push(`${label}: output artifact expectedArtifactId must be a non-empty string`);
      }
      if (
        artifact.env !== undefined
        && artifact.format === 'staging-reliability-artifact-v1'
        && typeof artifact.expectedArtifactId !== 'string'
      ) {
        violations.push(`${label}: staging reliability output artifact env "${artifact.env}" must define expectedArtifactId`);
      }
      validateExpectedProviderKeys(artifact, label);
      if (artifact.env !== undefined) {
        validateArtifactValidatorCoverage(job, artifact, label);
      }
    }
  }

  function validateArtifactValidatorCoverage(job, artifact, label) {
    const matchingValidator = job.validationCommands.some((command) => {
      const source = validationCommandSource(command);
      return source.includes(artifact.env) && source.includes(artifact.format);
    });

    if (!matchingValidator) {
      violations.push(
        `${label}: output artifact env "${artifact.env}" must be read by a validation command that checks format "${artifact.format}"`,
      );
    }
  }

  function validateRequiredJobEvidence(job, label) {
    const envNames = new Set([...(Array.isArray(job.requiredEnv) ? job.requiredEnv : []), ...(Array.isArray(job.optionalEnv) ? job.optionalEnv : [])]);
    const requiredEnvNames = requiredJobEnvNames.get(job.jobId) ?? [];
    for (const envName of requiredEnvNames) {
      if (!envNames.has(envName)) {
        violations.push(`${label}: must include required evidence env "${envName}"`);
      }
    }
    const optionalEnvNames = new Set(Array.isArray(job.optionalEnv) ? job.optionalEnv : []);
    const requiredOptionalEnvNames = requiredJobOptionalEnvNames.get(job.jobId) ?? [];
    for (const envName of requiredOptionalEnvNames) {
      if (!optionalEnvNames.has(envName)) {
        violations.push(`${label}: must include optional evidence env "${envName}"`);
      }
    }

    const requiredAlternatives = requiredJobEnvAlternatives.get(job.jobId) ?? [];
    for (const requiredAlternative of requiredAlternatives) {
      const hasAlternative = (Array.isArray(job.requiredEnvAlternatives) ? job.requiredEnvAlternatives : []).some((alternative) => (
        alternative !== null && typeof alternative === 'object' && alternative.label === requiredAlternative.label
        && providerKeysEqual(alternative.env, requiredAlternative.env)
        && providerKeysEqual(alternative.coversEnv ?? alternative.env, requiredAlternative.coversEnv)
        && (alternative.mode ?? null) === (requiredAlternative.mode ?? null)
      ));
      if (!hasAlternative) {
        violations.push(
          `${label}: requiredEnvAlternatives must include "${requiredAlternative.label}" env "${requiredAlternative.env.join(', ')}" covering "${requiredAlternative.coversEnv.join(', ')}"`,
        );
      }
    }

    const requiredArtifacts = requiredJobOutputArtifacts.get(job.jobId) ?? [];
    for (const requiredArtifact of requiredArtifacts) {
      const hasArtifact = (job.outputArtifacts ?? []).some((artifact) => {
        const refMatches = requiredArtifact.kind === 'path'
          ? artifact.path === requiredArtifact.ref
          : artifact.env === requiredArtifact.ref;
        const artifactIdMatches = requiredArtifact.expectedArtifactId === undefined
          || artifact.expectedArtifactId === requiredArtifact.expectedArtifactId;
        const providerKeysMatch = requiredArtifact.expectedProviderKeys === undefined
          || providerKeysEqual(artifact.expectedProviderKeys, requiredArtifact.expectedProviderKeys);
        return refMatches && artifact.format === requiredArtifact.format && artifactIdMatches && providerKeysMatch;
      });
      if (!hasArtifact) {
        const artifactIdSuffix = requiredArtifact.expectedArtifactId === undefined
          ? ''
          : ` and expectedArtifactId "${requiredArtifact.expectedArtifactId}"`;
        const providerKeysSuffix = requiredArtifact.expectedProviderKeys === undefined
          ? ''
          : ` and expectedProviderKeys "${requiredArtifact.expectedProviderKeys.join(', ')}"`;
        violations.push(
          `${label}: outputArtifacts must include ${requiredArtifact.kind} "${requiredArtifact.ref}" with format "${requiredArtifact.format}"${artifactIdSuffix}${providerKeysSuffix}`,
        );
      }
    }
  }

  function validateExpectedProviderKeys(artifact, label) {
    if (
      artifact.env !== undefined
      && artifact.format === 'source-live-provider-evidence-v1'
      && artifact.expectedProviderKeys === undefined
    ) {
      violations.push(`${label}: source live output artifact env "${artifact.env}" must define expectedProviderKeys`);
      return;
    }
    if (artifact.expectedProviderKeys === undefined) {
      return;
    }
    if (
      !Array.isArray(artifact.expectedProviderKeys)
      || artifact.expectedProviderKeys.length === 0
      || artifact.expectedProviderKeys.some((providerKey) => typeof providerKey !== 'string' || providerKey.trim().length === 0)
    ) {
      violations.push(`${label}: output artifact expectedProviderKeys must be non-empty strings`);
      return;
    }
    if (new Set(artifact.expectedProviderKeys).size !== artifact.expectedProviderKeys.length) {
      violations.push(`${label}: output artifact expectedProviderKeys must not contain duplicates`);
    }
  }

  function providerKeysEqual(actual, expected) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return false;
    }
    const actualKeys = new Set(actual);
    return expected.every((providerKey) => actualKeys.has(providerKey));
  }

  return { validateJobArtifacts, validateRequiredJobEvidence };
}
