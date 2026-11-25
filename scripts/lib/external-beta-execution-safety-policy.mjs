// Pure, caller-configured external-beta live-execution safety and artifact-freshness validation.
// No filesystem, environment, network or runtime execution in this module.
export function validateSafety({ contract, contractPath, forbiddenFragments, violations }) {
  const safety = contract.executionSafety;
  if (typeof safety !== 'object' || safety === null) {
    violations.push(`${contractPath}: executionSafety is required`);
    return;
  }
  if (!safety.liveExecutionRequires?.includes('--execute')) {
    violations.push(`${contractPath}: executionSafety.liveExecutionRequires must include --execute`);
  }
  if (!safety.liveExecutionRequires?.includes('EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live')) {
    violations.push(`${contractPath}: executionSafety.liveExecutionRequires must include confirmation env`);
  }
  if (safety.defaultActionWithoutExecute !== 'print_plan_only') {
    violations.push(`${contractPath}: executionSafety.defaultActionWithoutExecute must be print_plan_only`);
  }
  if (safety.manualArtifactJobsFailExecute !== true) {
    violations.push(`${contractPath}: executionSafety.manualArtifactJobsFailExecute must be true`);
  }
  if (safety.artifactValidationSkipsLiveRunners !== true) {
    violations.push(`${contractPath}: executionSafety.artifactValidationSkipsLiveRunners must be true`);
  }
  if (safety.liveExecutionValidatesOutputPathsBeforeRun !== true) {
    violations.push(`${contractPath}: executionSafety.liveExecutionValidatesOutputPathsBeforeRun must be true`);
  }
  if (safety.preflightRequiresEnvValueValidation !== true) {
    violations.push(`${contractPath}: executionSafety.preflightRequiresEnvValueValidation must be true`);
  }
  if (safety.preflightRequiresEvidencePathValidation !== true) {
    violations.push(`${contractPath}: executionSafety.preflightRequiresEvidencePathValidation must be true`);
  }
  if (safety.secretValuesMustStayOutOfArtifacts !== true) {
    violations.push(`${contractPath}: executionSafety.secretValuesMustStayOutOfArtifacts must be true`);
  }
  if (safety.criticalEnvValuesMustBeTyped !== true) {
    violations.push(`${contractPath}: executionSafety.criticalEnvValuesMustBeTyped must be true`);
  }
  if (safety.evidencePathEnvRequiresAbsolutePath !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresAbsolutePath must be true`);
  }
  if (safety.evidencePathEnvRequiresRegularFile !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresRegularFile must be true`);
  }
  if (safety.evidencePathEnvRequiresPrivateFileMode !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresPrivateFileMode must be true`);
  }
  if (!Number.isFinite(safety.evidencePathEnvMaxBytes) || safety.evidencePathEnvMaxBytes <= 0) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvMaxBytes must be positive`);
  }
  if (safety.evidencePathEnvRequiresJsonExtension !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresJsonExtension must be true`);
  }
  if (safety.evidencePathEnvRequiresJsonContent !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresJsonContent must be true`);
  }
  if (safety.evidencePathEnvForbidsWorkspacePath !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvForbidsWorkspacePath must be true`);
  }
  if (safety.evidencePathEnvRequiresWritableParent !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvRequiresWritableParent must be true`);
  }
  if (safety.evidencePathEnvForbidsDuplicatePaths !== true) {
    violations.push(`${contractPath}: executionSafety.evidencePathEnvForbidsDuplicatePaths must be true`);
  }
  if (safety.outputArtifactPathEnvRequiresJsonExtension !== true) {
    violations.push(`${contractPath}: executionSafety.outputArtifactPathEnvRequiresJsonExtension must be true`);
  }
  if (safety.envFileArg !== '--env-file') {
    violations.push(`${contractPath}: executionSafety.envFileArg must be --env-file`);
  }
  for (const [field, expected] of [
    ['envFileRequiresAbsolutePath', true],
    ['envFileRequiresEnvExtension', true],
    ['envFileRequiresRegularFile', true],
    ['envFileRequiresPrivateFileMode', true],
    ['envFileForbidsWorkspacePath', true],
    ['envFileForbidsFixturePath', true],
    ['envFileForbidsGitTrackedPath', true],
    ['envFileForbidsLiveExecutionConfirm', true],
  ]) {
    if (safety[field] !== expected) {
      violations.push(`${contractPath}: executionSafety.${field} must be ${expected}`);
    }
  }
  if (safety.envFileConflictPolicy !== 'fail_on_conflicting_values') {
    violations.push(`${contractPath}: executionSafety.envFileConflictPolicy must be fail_on_conflicting_values`);
  }
  for (const forbidden of forbiddenFragments) {
    if (!safety.forbiddenTargets?.includes(forbidden)) {
      violations.push(`${contractPath}: executionSafety.forbiddenTargets must include ${forbidden}`);
    }
  }
}

export function validateArtifactFreshnessPolicy({ contract, contractPath, violations }) {
  const freshness = contract.artifactFreshness;
  if (typeof freshness !== 'object' || freshness === null) {
    violations.push(`${contractPath}: artifactFreshness is required`);
    return;
  }
  if (!Number.isFinite(freshness.maxArtifactAgeHours) || freshness.maxArtifactAgeHours <= 0) {
    violations.push(`${contractPath}: artifactFreshness.maxArtifactAgeHours must be positive`);
  }
  if (!Number.isFinite(freshness.maxArtifactFutureSkewMinutes) || freshness.maxArtifactFutureSkewMinutes < 0) {
    violations.push(`${contractPath}: artifactFreshness.maxArtifactFutureSkewMinutes must be non-negative`);
  }
  if (freshness.requiresIso8601Timestamp !== true) {
    violations.push(`${contractPath}: artifactFreshness.requiresIso8601Timestamp must be true`);
  }

  const timestampPaths = new Set(freshness.timestampPaths ?? []);
  for (const timestampPath of ['sampledAt', 'generatedAt', 'completedAt', 'environment.sampledAt', 'source.sampleWindow.endedAt']) {
    if (!timestampPaths.has(timestampPath)) {
      violations.push(`${contractPath}: artifactFreshness.timestampPaths must include ${timestampPath}`);
    }
  }

  const requiredTimestampFormats = new Set(freshness.requiredTimestampFormats ?? []);
  const envArtifactFormats = new Set(
    contract.jobs
      .flatMap((job) => job.outputArtifacts ?? [])
      .filter((artifact) => artifact.env !== undefined)
      .map((artifact) => artifact.format),
  );
  for (const format of envArtifactFormats) {
    if (!requiredTimestampFormats.has(format)) {
      violations.push(`${contractPath}: artifactFreshness.requiredTimestampFormats must include ${format}`);
    }
  }
}

