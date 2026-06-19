import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, relative } from 'node:path';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const forbiddenEvidencePathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples', '/example-', '\\example-'];
const forbiddenArtifactValueFragments = [
  'bearer ',
  'basic ',
  'private_key',
  'client_secret=',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'redis://',
  'rediss://',
  'mysql://',
  'mongodb://',
  'mongodb+srv://',
  'github_pat_',
  'ghp_',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'xapp-',
  'akia',
  'aws_access_key_id',
  'aws_secret_access_key',
  'sk-proj-',
  'sk-live-',
  'smk_',
  'whsec_',
];
const forbiddenArtifactKeyNames = new Set([
  'authorization',
  'bearer',
  'token',
  'secret',
  'password',
  'apikey',
  'apitoken',
  'idtoken',
  'jwttoken',
  'sessiontoken',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'credentialvalue',
  'secretvalue',
  'signingsecret',
  'privatekey',
  'secretkey',
  'redditaccesstoken',
  'databaseurl',
  'rabbitmqurl',
]);
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const validateArtifacts = args.includes('--validate-artifacts');
const requireEnv = args.includes('--require-env');
const json = args.includes('--json');
const summary = args.includes('--summary');
if (execute && validateArtifacts) {
  console.error('Choose either --execute or --validate-artifacts, not both.');
  process.exit(1);
}
if (summary && (execute || validateArtifacts || json)) {
  console.error('Use --summary by itself, without --execute, --validate-artifacts or --json.');
  process.exit(1);
}

const selection = readSelectedJobSelection(args);
if (selection.errors.length > 0) {
  console.error('Invalid external beta evidence job selection:');
  for (const error of selection.errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const selectedJobIds = selection.jobIds;
const knownJobIds = new Set(contract.jobs.map((job) => job.jobId));
const unknownJobIds = selectedJobIds.filter((jobId) => !knownJobIds.has(jobId));
if (unknownJobIds.length > 0) {
  console.error(`Unknown external beta evidence job id(s): ${unknownJobIds.join(', ')}`);
  console.error(`Known jobs: ${[...knownJobIds].join(', ')}`);
  process.exit(1);
}

const jobs = selectedJobIds.length === 0
  ? contract.jobs
  : contract.jobs.filter((job) => selectedJobIds.includes(job.jobId));

if (jobs.length === 0) {
  console.error('No external beta evidence jobs matched the requested selection.');
  process.exit(1);
}

if (!execute && !validateArtifacts) {
  const plan = buildPlan(jobs);
  if (summary) {
    printSummary(plan);
  } else if (json) {
    printJsonPlan(plan);
  } else {
    printPlan(plan);
  }
  if (requireEnv && plan.missingEnvCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

if (validateArtifacts) {
  const validationViolations = artifactValidationViolations(jobs);
  if (validationViolations.length > 0) {
    console.error('Refusing to validate external beta evidence artifacts. Resolve all preflight violations first:');
    for (const violation of validationViolations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  for (const job of jobs) {
    for (const command of job.validationCommands) {
      runCommand(command, `${job.jobId}: artifact validation`);
    }
  }
  process.exit(0);
}

if (process.env.EXTERNAL_BETA_EVIDENCE_CONFIRM !== 'run-live') {
  console.error('Refusing to execute. Set EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live and pass --execute.');
  process.exit(1);
}

const executeViolations = executableJobViolations(jobs);
if (executeViolations.length > 0) {
  console.error('Refusing to execute external beta evidence jobs. Resolve all preflight violations first:');
  for (const violation of executeViolations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

for (const job of jobs) {
  if (job.runPolicy === 'live_command') {
    runCommand(job.runnerCommand, `${job.jobId}: runnerCommand`);
    validateGeneratedArtifacts(job);
  }

  for (const command of job.validationCommands) {
    runCommand(command, `${job.jobId}: validation`);
  }
}

function validateGeneratedArtifacts(job) {
  const validationViolations = artifactValidationViolations([job]);
  if (validationViolations.length > 0) {
    console.error('Refusing to validate generated external beta evidence artifacts. Resolve all post-run violations first:');
    for (const violation of validationViolations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }
}

function buildPlan(planJobs) {
  const plan = {
    runnerId: contract.runnerId,
    mode: execute ? 'execute' : validateArtifacts ? 'validate_artifacts' : 'plan_only',
    jobCount: planJobs.length,
    localContractJobCount: 0,
    liveCommandJobCount: 0,
    manualArtifactJobCount: 0,
    executableLiveJobCount: 0,
    externalBlockerJobCount: 0,
    missingEnvCount: 0,
    missingOptionalEnvCount: 0,
    readinessCounts: {},
    contractClosurePercent: 0,
    externalEvidenceEnvReadinessPercent: 0,
    manualArtifactReadyForValidationJobCount: 0,
    blockedMissingRequiredEnvJobCount: 0,
    uniqueMissingEnv: [],
    uniqueMissingOptionalEnv: [],
    jobs: [],
  };

  for (const job of planJobs) {
    const missingEnv = missingRequiredEnv(job);
    const missingOptionalEnv = missingOptionalEnvNames(job);
    const executionReadiness = jobExecutionReadiness(job, missingEnv);
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
      validationCommands: job.validationCommands,
      requiredEnv: job.requiredEnv,
      optionalEnv: job.optionalEnv,
      missingEnv,
      missingOptionalEnv,
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
      if (missingEnv.length === 0) {
        plan.executableLiveJobCount += 1;
      }
    }
    if (job.runPolicy === 'manual_artifact_then_validator') {
      plan.manualArtifactJobCount += 1;
      if (missingEnv.length === 0) {
        plan.manualArtifactReadyForValidationJobCount += 1;
      }
    }
    if (job.blocksExternalBeta === true) {
      plan.externalBlockerJobCount += 1;
    }
    if (executionReadiness === 'blocked_missing_required_env') {
      plan.blockedMissingRequiredEnvJobCount += 1;
    }
  }
  plan.uniqueMissingEnv = [...new Set(plan.jobs.flatMap((job) => job.missingEnv))].sort();
  plan.uniqueMissingOptionalEnv = [...new Set(plan.jobs.flatMap((job) => job.missingOptionalEnv))].sort();
  plan.contractClosurePercent = percent(plan.localContractJobCount, plan.jobCount);
  plan.externalEvidenceEnvReadinessPercent = percent(
    plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount,
    plan.liveCommandJobCount + plan.manualArtifactJobCount,
  );

  return plan;
}

function printPlan(plan) {
  console.log(`External beta evidence plan (${contract.runnerId})`);
  console.log(`Mode: ${plan.mode}`);
  console.log(`Jobs: ${plan.jobCount}`);
  console.log(
    `Run policies: local=${plan.localContractJobCount}, live=${plan.liveCommandJobCount}, manual=${plan.manualArtifactJobCount}`,
  );
  console.log(`Executable live jobs: ${plan.executableLiveJobCount}`);
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
    console.log(`  optionalEnv: ${job.optionalEnv.length === 0 ? 'none' : job.optionalEnv.join(', ')}`);
    console.log(`  missingEnv: ${job.missingEnv.length === 0 ? 'none' : job.missingEnv.join(', ')}`);
    console.log(`  missingOptionalEnv: ${job.missingOptionalEnv.length === 0 ? 'none' : job.missingOptionalEnv.join(', ')}`);
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

function printSummary(plan) {
  console.log(`External beta evidence summary (${contract.runnerId})`);
  console.log(`Jobs: ${plan.jobCount}`);
  console.log(`Contract closure: ${plan.localContractJobCount}/${plan.jobCount} jobs (${plan.contractClosurePercent}%)`);
  console.log(
    `External evidence env readiness: ${plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount}/${plan.liveCommandJobCount + plan.manualArtifactJobCount} live/manual jobs (${plan.externalEvidenceEnvReadinessPercent}%)`,
  );
  console.log(`External beta blocker jobs: ${plan.externalBlockerJobCount}`);
  console.log(`Blocked by missing required env: ${plan.blockedMissingRequiredEnvJobCount}`);
  console.log(`Missing required env: ${plan.missingEnvCount} occurrences, ${plan.uniqueMissingEnv.length} unique`);
  console.log(`Missing optional env: ${plan.missingOptionalEnvCount} occurrences, ${plan.uniqueMissingOptionalEnv.length} unique`);
  console.log('');
  console.log('Readiness counts:');
  for (const [readiness, count] of Object.entries(plan.readinessCounts).sort(([left], [right]) => left.localeCompare(right))) {
    console.log(`  ${readiness}: ${count}`);
  }
  if (plan.uniqueMissingEnv.length > 0) {
    console.log('');
    console.log('Required env still needed:');
    for (const envName of plan.uniqueMissingEnv) {
      console.log(`  ${envName}`);
    }
  }
}

function printJsonPlan(plan) {
  console.log(JSON.stringify(plan, null, 2));
}

function percent(numerator, denominator) {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 100);
}

function readSelectedJobSelection(argv) {
  const jobIds = [];
  const errors = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--job') {
      const value = argv[index + 1];
      if (isMissingSelectionValue(value)) {
        errors.push('--job requires a non-empty job id value');
        continue;
      }
      jobIds.push(value.trim());
      index += 1;
    } else if (argv[index] === '--jobs') {
      const value = argv[index + 1];
      if (isMissingSelectionValue(value)) {
        errors.push('--jobs requires a non-empty comma-separated job id list');
        continue;
      }
      const values = value.split(',').map((jobId) => jobId.trim()).filter(Boolean);
      if (values.length === 0) {
        errors.push('--jobs requires at least one job id');
        continue;
      }
      jobIds.push(...values);
      index += 1;
    }
  }
  return { jobIds, errors };
}

function isMissingSelectionValue(value) {
  return value === undefined || value.trim() === '' || value.startsWith('--');
}

function missingRequiredEnv(job) {
  return job.requiredEnv.filter((envName) => process.env[envName]?.trim() === undefined || process.env[envName]?.trim() === '');
}

function missingOptionalEnvNames(job) {
  return job.optionalEnv.filter((envName) => process.env[envName]?.trim() === undefined || process.env[envName]?.trim() === '');
}

function jobExecutionReadiness(job, missingEnv) {
  if (missingEnv.length > 0) {
    return 'blocked_missing_required_env';
  }
  if (job.runPolicy === 'manual_artifact_then_validator') {
    return 'manual_artifact_required';
  }
  if (job.runPolicy === 'live_command') {
    return 'live_command_executable';
  }
  return 'local_contract_ready';
}

function executableJobViolations(candidateJobs) {
  const violations = [];
  for (const job of candidateJobs) {
    const missingEnv = missingRequiredEnv(job);
    if (missingEnv.length > 0) {
      violations.push(`${job.jobId}: missing required env ${missingEnv.join(', ')}`);
    }
    if (job.runPolicy === 'manual_artifact_then_validator') {
      violations.push(`${job.jobId}: manual artifact job cannot be executed by this runner`);
    }
  }
  return violations;
}

function artifactValidationViolations(candidateJobs) {
  const violations = [];
  for (const job of candidateJobs) {
    const missingEnv = missingRequiredEnv(job);
    const missingEnvSet = new Set(missingEnv);
    if (missingEnv.length > 0) {
      violations.push(`${job.jobId}: missing required env ${missingEnv.join(', ')}`);
    }
    const invalidPathEnv = validateEvidencePathEnv(job, missingEnvSet, violations);

    for (const artifact of job.outputArtifacts ?? []) {
      if (artifact.env === undefined) {
        continue;
      }
      if (missingEnvSet.has(artifact.env) || invalidPathEnv.has(artifact.env)) {
        continue;
      }
      const artifactValue = process.env[artifact.env]?.trim();
      if (artifactValue === undefined || artifactValue === '') {
        violations.push(`${job.jobId}: output artifact env ${artifact.env} is empty`);
        continue;
      }
      if (artifact.env.endsWith('_PATH') && !existsSync(artifactValue)) {
        violations.push(`${job.jobId}: output artifact env ${artifact.env} must point to an existing file path`);
        continue;
      }
      if (isFixtureLikeArtifactPath(artifactValue)) {
        violations.push(`${job.jobId}: output artifact env ${artifact.env} must not point to fixture or example evidence`);
        continue;
      }

      const content = readJsonArtifact(artifactValue, job.jobId, artifact.env, violations);
      if (content === undefined) {
        continue;
      }
      validateArtifactRedaction(content, job.jobId, artifact.env, violations);
      if (content.schemaVersion !== 1) {
        violations.push(`${job.jobId}: output artifact env ${artifact.env} must use schemaVersion 1`);
      }
      const artifactFormat = content.format ?? content.artifactFormat;
      if (artifactFormat !== artifact.format) {
        violations.push(`${job.jobId}: output artifact env ${artifact.env} must use format ${artifact.format}`);
      }
      validateArtifactEnvConsistency(content, job, artifact.env, violations);
      validateArtifactFreshness(content, job, artifact.env, artifact.format, violations);
    }
  }
  return violations;
}

function validateEvidencePathEnv(job, missingEnvSet, violations) {
  const invalidPathEnv = new Set();
  const pathEnvNames = new Set([...(job.requiredEnv ?? []), ...(job.optionalEnv ?? [])]);

  for (const envName of pathEnvNames) {
    if (!envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
      continue;
    }

    const value = process.env[envName]?.trim();
    if (value === undefined || value === '') {
      continue;
    }
    if (!existsSync(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must point to an existing file path`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isFixtureLikeArtifactPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to fixture or example evidence`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isGitTrackedPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to a git-tracked file`);
      invalidPathEnv.add(envName);
      continue;
    }

    const violationCount = violations.length;
    validateEvidencePathFileContent(value, job.jobId, envName, violations);
    if (violations.length > violationCount) {
      invalidPathEnv.add(envName);
    }
  }

  return invalidPathEnv;
}

function validateEvidencePathFileContent(path, jobId, envName, violations) {
  let content;
  try {
    content = readFileSync(path, 'utf8');
  } catch {
    violations.push(`${jobId}: evidence path env ${envName} must be readable`);
    return;
  }

  validateArtifactLiteralRedaction(content, jobId, `evidence path env ${envName}`, violations);

  const parsed = parseJsonOrNull(content);
  if (parsed !== null && typeof parsed === 'object') {
    validateArtifactStructuredRedaction(parsed, jobId, `evidence path env ${envName}`, violations);
  }
}

function isFixtureLikeArtifactPath(path) {
  const normalized = path.toLowerCase();
  return forbiddenEvidencePathFragments.some((fragment) => normalized.includes(fragment))
    || normalized.split(/[\\/]+/).some((segment) => isFixtureLikePathSegment(segment));
}

function isFixtureLikePathSegment(segment) {
  return segment.includes('fixture') || segment.includes('example');
}

function isGitTrackedPath(path) {
  const pathspec = isAbsolute(path) ? relative(process.cwd(), path) : path;
  if (pathspec.startsWith('..')) {
    return false;
  }

  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', pathspec], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function readJsonArtifact(path, jobId, envName, violations) {
  try {
    const content = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof content !== 'object' || content === null || Array.isArray(content)) {
      violations.push(`${jobId}: output artifact env ${envName} must point to a JSON object artifact`);
      return undefined;
    }
    return content;
  } catch {
    violations.push(`${jobId}: output artifact env ${envName} must point to a valid JSON artifact`);
    return undefined;
  }
}

function validateArtifactRedaction(content, jobId, envName, violations) {
  validateArtifactLiteralRedaction(JSON.stringify(content), jobId, `output artifact env ${envName}`, violations);
  validateArtifactStructuredRedaction(content, jobId, `output artifact env ${envName}`, violations);
}

function validateArtifactEnvConsistency(content, job, artifactEnv, violations) {
  for (const rule of artifactEnvConsistencyRules()) {
    if (!(job.requiredEnv ?? []).includes(rule.envName) && !(job.optionalEnv ?? []).includes(rule.envName)) {
      continue;
    }

    const expected = process.env[rule.envName]?.trim();
    if (expected === undefined || expected === '') {
      continue;
    }

    const observedValues = observedArtifactStringValues(content, rule.paths);
    if (observedValues.length === 0) {
      continue;
    }

    for (const observed of observedValues) {
      if (observed !== expected) {
        violations.push(`${job.jobId}: output artifact env ${artifactEnv} ${rule.label} must match ${rule.envName}`);
      }
    }
  }
}

function validateArtifactFreshness(content, job, artifactEnv, artifactFormat, violations) {
  const freshness = contract.artifactFreshness;
  if (typeof freshness !== 'object' || freshness === null) {
    return;
  }

  const timestampPaths = Array.isArray(freshness.timestampPaths) ? freshness.timestampPaths : [];
  const timestamps = observedArtifactTimestampValues(content, timestampPaths);
  const requiredTimestampFormats = new Set(freshness.requiredTimestampFormats ?? []);
  if (requiredTimestampFormats.has(artifactFormat) && timestamps.length === 0) {
    violations.push(`${job.jobId}: output artifact env ${artifactEnv} must include a release evidence timestamp`);
    return;
  }

  const maxAgeMs = Number(freshness.maxArtifactAgeHours) * 60 * 60 * 1000;
  const maxFutureSkewMs = Number(freshness.maxArtifactFutureSkewMinutes) * 60 * 1000;
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || !Number.isFinite(maxFutureSkewMs) || maxFutureSkewMs < 0) {
    violations.push(`${job.jobId}: artifact freshness policy is invalid`);
    return;
  }

  const now = Date.now();
  for (const timestamp of timestamps) {
    const observedAtMs = Date.parse(timestamp.value);
    if (!Number.isFinite(observedAtMs)) {
      violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must be ISO-8601`);
      continue;
    }
    if (observedAtMs > now + maxFutureSkewMs) {
      violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must not be in the future`);
    }
    if (observedAtMs < now - maxAgeMs) {
      violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} is older than ${freshness.maxArtifactAgeHours} hours`);
    }
  }
}

function artifactEnvConsistencyRules() {
  return [
    {
      envName: 'STAGING_ENVIRONMENT_ID',
      label: 'environmentId',
      paths: [['environmentId'], ['environment', 'environmentId']],
    },
    {
      envName: 'SOURCE_LIVE_ENVIRONMENT_ID',
      label: 'environmentId',
      paths: [['environmentId'], ['environment', 'environmentId']],
    },
    {
      envName: 'BACKEND_IMAGE_DIGEST',
      label: 'imageDigest',
      paths: [['imageDigest'], ['environment', 'imageDigest']],
    },
    {
      envName: 'API_BASE_URL',
      label: 'apiBaseUrl',
      paths: [['apiBaseUrl'], ['environment', 'apiBaseUrl']],
    },
    {
      envName: 'SOURCE_LIVE_OPERATOR',
      label: 'operator',
      paths: [['operator'], ['environment', 'operator']],
    },
    {
      envName: 'STAGING_SECRET_STORE_ID',
      label: 'secretStoreId',
      paths: [['secretStoreId'], ['environment', 'secretStoreId']],
    },
  ];
}

function observedArtifactTimestampValues(content, paths) {
  const values = [];
  for (const path of paths) {
    const segments = String(path).split('.');
    let cursor = content;
    for (const segment of segments) {
      cursor = cursor?.[segment];
    }
    if (typeof cursor === 'string' && cursor.trim().length > 0) {
      values.push({ path, value: cursor.trim() });
    }
  }
  return values;
}

function observedArtifactStringValues(content, paths) {
  const values = [];
  for (const path of paths) {
    let cursor = content;
    for (const segment of path) {
      cursor = cursor?.[segment];
    }
    if (typeof cursor === 'string' && cursor.trim().length > 0) {
      values.push(cursor.trim());
    }
  }
  return [...new Set(values)];
}

function validateArtifactLiteralRedaction(content, jobId, label, violations) {
  const serialized = content.toLowerCase();
  for (const fragment of forbiddenArtifactValueFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${jobId}: ${label} must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateArtifactStructuredRedaction(content, jobId, label, violations) {
  if (containsFixtureProvenance(content)) {
    violations.push(`${jobId}: ${label} must not contain fixture provenance`);
  }

  for (const keyPath of unredactedSensitiveKeyPaths(content)) {
    violations.push(`${jobId}: ${label} must not contain unredacted sensitive key "${keyPath}"`);
  }
}

function parseJsonOrNull(content) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function containsFixtureProvenance(value) {
  if (Array.isArray(value)) {
    return value.some((item) => containsFixtureProvenance(item));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (value.fixtureOnly === true || value.evidenceKind === 'fixture_example') {
    return true;
  }

  return Object.values(value).some((item) => containsFixtureProvenance(item));
}

function unredactedSensitiveKeyPaths(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unredactedSensitiveKeyPaths(item, [...path, String(index)]));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (forbiddenArtifactKeyNames.has(normalizeArtifactKey(key)) && !isRedactedArtifactValue(child)) {
      findings.push(nextPath.join('.'));
    }
    findings.push(...unredactedSensitiveKeyPaths(child, nextPath));
  }
  return findings;
}

function normalizeArtifactKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRedactedArtifactValue(value) {
  if (value === null || value === false) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes('not-redacted') || normalized.includes('not redacted') || normalized.includes('unredacted')) {
    return false;
  }
  return normalized.length === 0
    || normalized.includes('redacted')
    || normalized.includes('masked')
    || normalized.includes('omitted')
    || normalized.includes('absent')
    || normalized.includes('unavailable');
}

function formatOutputArtifacts(job) {
  return job.outputArtifacts
    .map((artifact) => {
      const location = artifact.path ?? `<env:${artifact.env}>`;
      return `${location} (${artifact.format})`;
    })
    .join(', ');
}

function runCommand(command, label) {
  const scriptName = scriptNameFromCommand(command);
  if (scriptName === null) {
    throw new Error(`${label}: unsupported command "${command}"`);
  }
  console.log(`\n> ${label}: npm run ${scriptName}`);
  execFileSync('npm', ['run', scriptName], { stdio: 'inherit' });
}

function scriptNameFromCommand(command) {
  const match = /^npm run ([^ ]+)/.exec(String(command ?? ''));
  return match?.[1] ?? null;
}
