// Declarative external-beta job and env-example validation. The runner owns filesystem and script lookup.
export function createExternalBetaJobRequirementsPolicy({
  violations, contract, contractPath, envExampleSource, allowedModes, allowedRunPolicies,
  externalGroups, auditRequirements, backendScripts, forbiddenFragments,
  validateCommand, scriptNameFromCommand,
}) {
  function validateEnvExample() {
    if (envExampleSource.trim().length === 0) {
      violations.push(`${contractPath}: envExample must reference a non-empty env example file`);
      return;
    }
  
    const expectedEnvNames = new Set([
      'EXTERNAL_BETA_EVIDENCE_CONFIRM',
      ...contract.jobs.flatMap((job) => job.requiredEnv ?? []),
      ...contract.jobs.flatMap((job) => (job.requiredEnvAlternatives ?? []).flatMap((alternative) => alternative.env ?? [])),
      ...contract.jobs.flatMap((job) => job.optionalEnv ?? []),
    ]);
    const actualEnvNames = new Set();
  
    for (const [lineIndex, line] of envExampleSource.split('\n').entries()) {
      const trimmed = line.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) {
        continue;
      }
  
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(trimmed);
      if (match === null) {
        violations.push(`${contract.envExample}:${lineIndex + 1}: env example line must be KEY=`);
        continue;
      }
  
      const [, envName, value] = match;
      if (actualEnvNames.has(envName)) {
        violations.push(`${contract.envExample}: duplicate env example entry "${envName}"`);
      }
      actualEnvNames.add(envName);
  
      if (!expectedEnvNames.has(envName)) {
        violations.push(`${contract.envExample}: unexpected env example entry "${envName}"`);
      }
      if (value.trim().length > 0) {
        violations.push(`${contract.envExample}: env example entry "${envName}" must not commit a value`);
      }
    }
  
    for (const envName of expectedEnvNames) {
      if (!actualEnvNames.has(envName)) {
        violations.push(`${contract.envExample}: missing env example entry "${envName}"`);
      }
    }
  }

  function validateJobBasics(job, label) {
    for (const field of ['jobId', 'evidenceGroupId', 'requirementId', 'mode', 'runPolicy', 'owner', 'exitCondition']) {
      if (typeof job[field] !== 'string' || job[field].trim().length === 0) {
        violations.push(`${label}: ${field} must be a non-empty string`);
      }
    }
    if (!allowedModes.has(job.mode)) {
      violations.push(`${label}: unsupported mode "${job.mode}"`);
    }
    if (!allowedRunPolicies.has(job.runPolicy)) {
      violations.push(`${label}: unsupported runPolicy "${job.runPolicy}"`);
    }
    if (job.blocksExternalBeta !== true) {
      violations.push(`${label}: blocksExternalBeta must be true`);
    }
    for (const optionalField of ['runnerDescription', 'operatorAction']) {
      if (job[optionalField] !== undefined && (typeof job[optionalField] !== 'string' || job[optionalField].trim().length === 0)) {
        violations.push(`${label}: ${optionalField} must be a non-empty string when set`);
      }
    }
    if (job.jobId === 'summary-real-feedback-import') {
      for (const field of ['runnerDescription', 'operatorAction', 'exitCondition']) {
        if (!String(job[field] ?? '').includes('export:summary-feedback-samples')) {
          violations.push(`${label}: ${field} must reference export:summary-feedback-samples`);
        }
      }
    }
  
    const group = externalGroups.get(job.evidenceGroupId);
    if (group === undefined) {
      violations.push(`${label}: evidenceGroupId must reference external beta readiness group`);
    } else if (job.owner !== group.owner) {
      violations.push(`${label}: owner must match external readiness group owner "${group.owner}"`);
    }
  
    const requirement = auditRequirements.get(job.requirementId);
    if (requirement === undefined) {
      violations.push(`${label}: requirementId must reference backend MVP completion audit requirement`);
    } else if (requirement.externalReadinessGroupId !== job.evidenceGroupId) {
      violations.push(`${label}: requirementId must map to evidenceGroupId "${job.evidenceGroupId}"`);
    }
  }

  function validateJobCommands(job, label) {
    if (!Array.isArray(job.validationCommands) || job.validationCommands.length === 0) {
      violations.push(`${label}: validationCommands must be non-empty`);
    } else {
      for (const command of job.validationCommands) {
        validateCommand(command, `${label}: validationCommands`);
      }
    }
  
    if (job.runPolicy === 'live_command') {
      if (typeof job.runnerCommand !== 'string' || job.runnerCommand.trim().length === 0) {
        violations.push(`${label}: live_command requires runnerCommand`);
      } else {
        validateCommand(job.runnerCommand, `${label}: runnerCommand`);
        const scriptName = scriptNameFromCommand(job.runnerCommand);
        if (backendScripts.has(scriptName)) {
          violations.push(`${label}: live runnerCommand must not be included in backend-safe verify`);
        }
      }
      if (job.mode !== 'live_network') {
        violations.push(`${label}: live_command must use mode live_network`);
      }
    }
  
    if (job.runPolicy === 'manual_artifact_then_validator' && job.runnerCommand !== null) {
      violations.push(`${label}: manual_artifact_then_validator must keep runnerCommand=null`);
    }
    if (job.runPolicy === 'local_contract' && job.runnerCommand !== null) {
      violations.push(`${label}: local_contract must keep runnerCommand=null`);
    }
  }

  function validateJobEnvironment(job, label) {
    for (const field of ['requiredEnv', 'optionalEnv']) {
      if (!Array.isArray(job[field])) {
        violations.push(`${label}: ${field} must be an array`);
        continue;
      }
      const seen = new Set();
      for (const envName of job[field]) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(String(envName))) {
          violations.push(`${label}: ${field} contains invalid env name "${envName}"`);
        }
        if (seen.has(envName)) {
          violations.push(`${label}: ${field} contains duplicate env name "${envName}"`);
        }
        seen.add(envName);
      }
    }
  
    if (job.requiredEnvAlternatives !== undefined && !Array.isArray(job.requiredEnvAlternatives)) {
      violations.push(`${label}: requiredEnvAlternatives must be an array when set`);
    }
    const requiredEnvSet = new Set(job.requiredEnv ?? []);
    for (const [index, alternative] of (job.requiredEnvAlternatives ?? []).entries()) {
      const alternativeLabel = `${label}: requiredEnvAlternatives[${index}]`;
      if (typeof alternative.label !== 'string' || alternative.label.trim().length === 0) {
        violations.push(`${alternativeLabel}: label must be a non-empty string`);
      }
      if (!Array.isArray(alternative.env) || alternative.env.length === 0) {
        violations.push(`${alternativeLabel}: env must be a non-empty array`);
      }
      const seenEnv = new Set();
      for (const envName of alternative.env ?? []) {
        if (!/^[A-Z][A-Z0-9_]*$/.test(String(envName))) {
          violations.push(`${alternativeLabel}: env contains invalid env name "${envName}"`);
        }
        if (seenEnv.has(envName)) {
          violations.push(`${alternativeLabel}: env contains duplicate env name "${envName}"`);
        }
        seenEnv.add(envName);
      }
      if (alternative.coversEnv !== undefined && !Array.isArray(alternative.coversEnv)) {
        violations.push(`${alternativeLabel}: coversEnv must be an array when set`);
      }
      for (const envName of alternative.coversEnv ?? []) {
        if (!requiredEnvSet.has(envName)) {
          violations.push(`${alternativeLabel}: coversEnv "${envName}" must be listed in requiredEnv`);
        }
      }
      if (
        alternative.mode !== undefined
        && !['live_command_credential', 'captured_artifact'].includes(alternative.mode)
      ) {
        violations.push(`${alternativeLabel}: mode must be live_command_credential or captured_artifact when set`);
      }
    }
  
    if (job.runPolicy !== 'local_contract' && job.requiredEnv.length === 0) {
      violations.push(`${label}: non-local job must define requiredEnv`);
    }
  }

  function validateJobScopeSafety(job, label) {
    const searchable = JSON.stringify({
      jobId: job.jobId,
      mode: job.mode,
      runnerCommand: job.runnerCommand,
      validationCommands: job.validationCommands,
      outputArtifacts: job.outputArtifacts,
    }).toLowerCase();
  
    for (const fragment of forbiddenFragments) {
      if (searchable.includes(fragment)) {
        violations.push(`${label}: must not reference forbidden target fragment "${fragment}"`);
      }
    }
  }

  return {
    validateEnvExample, validateJobBasics, validateJobCommands,
    validateJobEnvironment, validateJobScopeSafety,
  };
}
