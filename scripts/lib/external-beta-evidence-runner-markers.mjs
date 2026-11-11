export const redactionPolicyPath = 'scripts/lib/external-beta-evidence-artifact-redaction.mjs';
export const handoffPolicyPath = 'scripts/lib/external-beta-evidence-handoff.mjs';
export const displayPolicyPath = 'scripts/lib/external-beta-evidence-display-formatters.mjs';
export const consistencyPolicyPath = 'scripts/lib/external-beta-artifact-consistency-freshness.mjs';
export const readinessPolicyPath = 'scripts/lib/external-beta-evidence-job-readiness.mjs';

export function validateRunnerImplementationMarkers({
  runnerSource,
  handoffSource,
  displaySource,
  consistencyPolicySource,
  readinessPolicySource,
  checkSource,
  selectionHelperSource,
  redactionPolicySource,
  runnerFile,
  checkFile,
  selectionHelperPath,
}) {
  const violations = [];
  for (const marker of [
    'unknownJobIds',
    'Unknown external beta evidence job id(s)',
    'Known jobs:',
    'executableJobViolations',
    'Refusing to execute external beta evidence jobs. Resolve all preflight violations first:',
    'validateGeneratedArtifacts',
    'Refusing to validate generated external beta evidence artifacts',
    'post-run violations',
    'printJsonPlan',
    'printSummary',
    'printHandoff',
    'printJsonHandoff',
    'external-beta-evidence-input-matrix.json',
    'External Beta Evidence Handoff',
    'Artifact paths are printed by env name only',
    'dockerBundleImportCommand',
    'Import Docker bundle env',
    'contractClosurePercent',
    'externalEvidenceEnvReadinessPercent',
    'liveArtifactReadyForValidationJobCount',
    'readinessCounts',
    'manualArtifactReadyForValidationJobCount',
    'blockedMissingRequiredEnvJobCount',
    'blockedInvalidInputJobCount',
    'blockedLocalRuntimeEnvJobCount',
    'Blocked by local runtime env',
    'uniqueMissingEnv',
    'readSelectedJobSelection',
    'Invalid external beta evidence job selection:',
    'readEnvFileSelection',
    'Invalid external beta evidence env file selection:',
    'loadExternalBetaEnvFiles',
    'parseDotenv',
    'EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell',
    'conflicts with',
    'refusing to merge evidence from different runs',
    'Load env files: append --env-file',
    'missingOptionalEnvCount',
    'uniqueMissingOptionalEnv',
    'requiredEnvAlternatives',
    'requiredEnvAlternativeCoveredEnvNames',
    'jobInputEnvNames',
    'allowCapturedArtifactAlternatives',
    'jobExecutionReadiness',
    'localRuntimeEnvNames',
    'isLocalRuntimeEnvValue',
    'manualArtifactJobCount',
    'executableLiveJobCount',
    'validateArtifacts',
    'contractSmokeArtifactOnly',
    '--contract-smoke-artifact-only',
    '!contractSmokeArtifactOnly',
    'artifactValidationViolations',
    'Refusing to validate external beta evidence artifacts',
    'planPreflightViolations',
    'jobPreflightViolations',
    'preflightViolations',
    'Refusing external beta evidence preflight',
    'Blocked by invalid env/path',
    'preflightRequiresEnvValueValidation',
    'preflightRequiresEvidencePathValidation',
    'validatePlannedEvidencePathEnv',
    'before preflight',
    'validateExecutableOutputArtifactPathEnv',
    'liveExecutionValidatesOutputPathsBeforeRun',
    'before live execution',
    'validateEvidenceValueEnv',
    'criticalEnvValuesMustBeTyped',
    'immutable sha256 image digest',
    'valid https URL',
    'valid PostgreSQL URL',
    'valid RabbitMQ URL',
    'validateTypedUrlEnv',
    'validateHttpsEvidenceUrlEnv',
    'validateSecretTokenEnv',
    'validateSecretReferenceEnv',
    'postgresUrlEnvNames',
    'rabbitmqUrlEnvNames',
    'httpsEvidenceUrlEnvNames',
    'tokenEvidenceEnvNames',
    'secretReferenceEnvNames',
    'isPlaceholderSecretValue',
    'isRawSecretValueReference',
    'non-placeholder secret value',
    'non-placeholder secret reference',
    'postgresql:',
    'amqps:',
    'realEvidenceIdentityEnvNames',
    'isFixtureLikeEnvValue',
    'output artifact env',
    'readJsonArtifact',
    'valid JSON artifact',
    'artifactFormat',
    'must use format',
    'forbiddenEvidencePathFragments',
    'isFixtureLikeArtifactPath',
    'isFixtureLikePathSegment',
    'must not point to fixture or example evidence',
    'isGitTrackedPath',
    'ls-files',
    'git-tracked file',
    'schemaVersion 1',
    'validateEvidencePathEnv',
    'evidence path env',
    'absolute file path',
    'evidencePathEnvRequiresRegularFile',
    'evidencePathEnvRequiresPrivateFileMode',
    'requiresPrivateEvidenceFileMode',
    'isPrivateEvidenceFile',
    '0600-style private file permissions',
    'before preflight',
    'before live execution',
    'isRegularEvidenceFile',
    'statSync',
    'must point to a regular file',
    'realpath must point to a regular file',
    'evidencePathEnvMaxBytes',
    'isOversizedEvidenceFile',
    'must not exceed',
    'Evidence path max size',
    'evidencePathEnvRequiresJsonExtension',
    'evidencePathEnvRequiresJsonContent',
    'evidencePathEnvForbidsWorkspacePath',
    'evidencePathEnvRequiresWritableParent',
    'evidencePathEnvForbidsDuplicatePaths',
    'requiresJsonEvidencePathEnv',
    'requiresJsonEvidencePathContent',
    'forbidsWorkspaceEvidencePaths',
    'isForbiddenWorkspaceEvidencePath',
    'inside the git workspace',
    'isValidEvidencePathParentDirectory',
    'isRegularDirectory',
    'parent directory must exist',
    'parent directory must be writable',
    'parent directory must not be inside the git workspace',
    'duplicateEvidencePathViolations',
    'duplicateEvidencePathViolationsByJob',
    'evidencePathDuplicateKey',
    'must not duplicate another evidence artifact path in this run',
    'outputArtifactPathEnvRequiresJsonExtension',
    'isJsonEvidencePath',
    'path must end with .json',
    'realpath must end with .json',
    'readEvidenceRealPath',
    'realpathSync',
    'realpath must not point to fixture or example evidence',
    'realpath must not point to a git-tracked file',
    'validateEvidencePathFileContent',
    'must be readable',
    'valid JSON evidence',
    'JSON object or array evidence file',
    'parseJsonEvidenceContent',
    'isStructuredJsonEvidence',
    'validateArtifactRedaction',
    'validateArtifactIdentity',
    'expectedArtifactId',
    'must use artifactId',
    'validateArtifactProviderKeys',
    'expectedProviderKeys',
    'must include providerKey',
    'must not include providerKey',
    'validateArtifactEnvConsistency',
    'validateArtifactFreshness',
    'validateArtifactLiteralRedaction',
    'validateArtifactStructuredRedaction',
    'validateArtifactDecodedRedaction',

  ]) {
    if (!runnerSource.includes(marker)) {
      violations.push(`${runnerFile}: runner must fail fast before executing unsafe job selections`);
    }
  }

  // Existing fail-closed environment safety markers relocated to their actual implementation owner.
  // Keep the original runner guards on the CLI, and independently enforce all moved invariants.
  for (const marker of [
    'satisfiedRequiredEnvAlternatives',
    'coversEnv',
    'hasSatisfiedCapturedArtifactAlternative',
    'captured_artifact',
    'blocked_missing_required_env',
    'blocked_invalid_env',
    'blocked_local_runtime_env',
    'live_artifact_ready_for_validation',
    'hasOnlyLocalRuntimeEnvViolations',
  ]) {
    if (!readinessPolicySource.includes(marker)) {
      violations.push(`${readinessPolicyPath}: extracted env readiness must preserve "${marker}"`);
    }
  }

  // The extracted policy, not the runner, owns these artifact identity/freshness invariants.
  for (const marker of [
    'validateArtifactEnvConsistency',
    'validateArtifactFreshness',
    'artifactFreshness',
    'isIso8601Timestamp',
    'requiresIso8601Timestamp',
    'maxArtifactAgeHours',
    'maxArtifactFutureSkewMinutes',
    'observedArtifactTimestampValues',
    'release evidence timestamp',
    'older than',
    'must not be in the future',
    'artifactEnvConsistencyRules',
    'observedArtifactStringValues',
    'must match ${rule.envName}',
    'STAGING_ENVIRONMENT_ID',
    'BACKEND_IMAGE_DIGEST',
    'BACKEND_GIT_COMMIT_SHA',
    'SOURCE_LIVE_ENVIRONMENT_ID',
    'SOURCE_LIVE_OPERATOR',
    'STAGING_SECRET_STORE_ID',
  ]) {
    if (!consistencyPolicySource.includes(marker)) {
      violations.push(`${consistencyPolicyPath}: extracted artifact consistency/freshness policy must preserve "${marker}"`);
    }
  }

  // The JSON handoff projection moved; its markers must stay enforced at the new owner.
  for (const marker of [
    'buildHandoff',
    'buildHandoffArtifactContracts',
    'buildHandoffInputs',
    'buildHandoffEnvArtifacts',
    'requiredAlternativeInputs',
  ]) {
    if (!handoffSource.includes(marker)) {
      violations.push(`${handoffPolicyPath}: extracted JSON handoff must preserve "${marker}"`);
    }
  }

  // Display and handoff projection moved; enforce their markers at the actual owner.
  for (const marker of [
    'formatOutputArtifacts', 'formatRequiredEnvAlternatives', 'formatHandoffArtifacts',
    'handoffAction', 'handoffRunner', 'artifactExamplePathByFormat', 'inputMetadataByEnv',
    'runnerDescription', 'operatorAction',
  ]) {
    if (!displaySource.includes(marker)) {
      violations.push(`${displayPolicyPath}: extracted display formatters must preserve "${marker}"`);
    }
  }

  // The extracted security-policy module, not the CLI runner, now owns these guards.
  for (const marker of [
    'validateArtifactDecodedRedaction',
    'forbiddenArtifactValueFragments',
    'forbiddenArtifactValuePatterns',
    'sensitive literal pattern',
    'access_token',
    'x-api-key',
    'jwt credential',
    'forbiddenArtifactKeyPatterns',
    'isForbiddenArtifactKey',
    'access|refresh|id|jwt|session',
    'github_pat_',
    'glpat-',
    'xoxb-',
    'mongodb+srv://',
    'aws_secret_access_key',
    'sk-proj-',
    'forbiddenArtifactKeyNames',
    'apikey',
    'idtoken',
    'sessiontoken',
    'signingsecret',
    'sensitive literal fragment',
    'containsFixtureProvenance',
    'fixture provenance',
    'unredactedSensitiveKeyPaths',
    'unredacted sensitive key',
    'normalizeArtifactKey',
    'isRedactedArtifactValue',
    'not-redacted',
    'unredacted',
    'parseJsonEvidenceContent',
    'realArtifactMarkerGuardFormats',
    'requiresRealArtifactMarkerGuard',
    'fixtureMarkerFindings',
    'fixture marker',
  ]) {
    if (!redactionPolicySource.includes(marker)) {
      violations.push(`${redactionPolicyPath}: extracted redaction policy must preserve "${marker}"`);
    }
  }

  for (const marker of [
    'strictSemanticNegativeSmokeLabels',
    'representativeSemanticNegativeSmokeLabels',
    'negativeSmokeOptions',
    'shouldRunNegativeSmoke',
  ]) {
    if (!checkSource.includes(marker)) {
      violations.push(`${checkFile}: checker must keep bounded semantic negative smoke coverage through ${marker}`);
    }
  }
  // The CLI parser owns this diagnostic after extraction from the runner.
  if (!selectionHelperSource.includes('--jobs requires at least one job id')) {
    violations.push(`${selectionHelperPath}: selection helper must reject an empty --jobs list`);
  }
  return violations;
}
