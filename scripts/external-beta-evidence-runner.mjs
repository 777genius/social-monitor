import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { URL } from 'node:url';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const inputMatrixPath = 'ops/release/external-beta-evidence-input-matrix.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const inputMatrix = JSON.parse(readFileSync(inputMatrixPath, 'utf8'));
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
const forbiddenArtifactValuePatterns = [
  {
    label: 'query credential',
    regex: /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
  },
  {
    label: 'header credential',
    regex: /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
  },
  {
    label: 'jwt credential',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
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
const forbiddenArtifactKeyPatterns = [
  /(?:raw|plain|plaintext|cleartext).*(?:token|secret|password|credential|apikey|clientsecret|privatekey|signingsecret)/,
  /(?:token|secret|password|credential|apikey|clientsecret|privatekey|signingsecret).*(?:raw|plain|plaintext|cleartext|value)$/,
  /(?:access|refresh|id|jwt|session)token(?:raw|plain|plaintext|cleartext|value)$/,
];
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const validateArtifacts = args.includes('--validate-artifacts');
const requireEnv = args.includes('--require-env');
const json = args.includes('--json');
const summary = args.includes('--summary');
const handoff = args.includes('--handoff');
const handoffJson = args.includes('--handoff-json');
if (execute && validateArtifacts) {
  console.error('Choose either --execute or --validate-artifacts, not both.');
  process.exit(1);
}
if (summary && (execute || validateArtifacts || json || handoff || handoffJson)) {
  console.error('Use --summary by itself, without --execute, --validate-artifacts, --handoff, --handoff-json or --json.');
  process.exit(1);
}
if (handoff && (execute || validateArtifacts || json || summary || handoffJson)) {
  console.error('Use --handoff without --execute, --validate-artifacts, --summary, --handoff-json or --json.');
  process.exit(1);
}
if (handoffJson && (execute || validateArtifacts || json || summary || handoff)) {
  console.error('Use --handoff-json without --execute, --validate-artifacts, --summary, --handoff or --json.');
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
  if (handoff) {
    printHandoff(plan);
  } else if (handoffJson) {
    printJsonHandoff(plan);
  } else if (summary) {
    printSummary(plan);
  } else if (json) {
    printJsonPlan(plan);
  } else {
    printPlan(plan);
  }
  const preflightViolations = requireEnv ? planPreflightViolations(jobs) : [];
  if (preflightViolations.length > 0) {
    console.error('');
    console.error('Refusing external beta evidence preflight. Resolve all preflight violations first:');
    for (const violation of preflightViolations) {
      console.error(`- ${violation}`);
    }
  }
  if (requireEnv && (plan.missingEnvCount > 0 || preflightViolations.length > 0)) {
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
  const duplicatePreflightViolationsByJob = duplicateEvidencePathViolationsByJob(planJobs);
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

function printSummary(plan) {
  console.log(`External beta evidence summary (${contract.runnerId})`);
  console.log(`Jobs: ${plan.jobCount}`);
  console.log(`Contract closure: ${plan.localContractJobCount}/${plan.jobCount} jobs (${plan.contractClosurePercent}%)`);
  console.log(
    `External evidence env readiness: ${plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount}/${plan.liveCommandJobCount + plan.manualArtifactJobCount} live/manual jobs (${plan.externalEvidenceEnvReadinessPercent}%)`,
  );
  console.log(`External beta blocker jobs: ${plan.externalBlockerJobCount}`);
  console.log(`Blocked by missing required env: ${plan.blockedMissingRequiredEnvJobCount}`);
  console.log(`Blocked by invalid env/path: ${plan.blockedInvalidInputJobCount}`);
  console.log(`Blocked by local runtime env: ${plan.blockedLocalRuntimeEnvJobCount}`);
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

function printHandoff(plan) {
  console.log(`# External Beta Evidence Handoff (${contract.runnerId})`);
  console.log('');
  console.log(`Scope: ${contract.scope}`);
  console.log(`Frontend policy: ${contract.frontendPolicy}`);
  console.log(`Default mode: ${contract.defaultMode}`);
  console.log(`Env template: ${contract.envExample}`);
  console.log('');
  console.log('Safety gates:');
  console.log(`- Inspect plan: ${contract.planCommand}`);
  console.log(`- Inspect summary: ${contract.summaryCommand}`);
  console.log(`- Preflight env: ${contract.preflightCommand}`);
  console.log(`- Validate artifacts: ${contract.artifactValidationCommand}`);
  console.log(`- Live execution requires: ${contract.executionSafety.liveExecutionRequires.join(' + ')}`);
  console.log(`- Evidence path max size: ${formatBytes(evidencePathMaxBytes())}`);
  console.log('- Do not use fixture, example, git-tracked or secret-bearing files as evidence artifacts.');
  console.log('- Artifact paths are printed by env name only. Env values are never printed by this handoff.');
  console.log('');
  console.log(`Current closure: ${plan.localContractJobCount}/${plan.jobCount} local-contract jobs (${plan.contractClosurePercent}%)`);
  console.log(
    `Current external evidence env readiness: ${plan.executableLiveJobCount + plan.manualArtifactReadyForValidationJobCount}/${plan.liveCommandJobCount + plan.manualArtifactJobCount} live/manual jobs (${plan.externalEvidenceEnvReadinessPercent}%)`,
  );
  console.log(`Blocked by missing required env: ${plan.blockedMissingRequiredEnvJobCount}`);
  console.log(`Blocked by invalid env/path: ${plan.blockedInvalidInputJobCount}`);
  console.log(`Blocked by local runtime env: ${plan.blockedLocalRuntimeEnvJobCount}`);
  if (plan.uniqueMissingEnv.length > 0) {
    console.log('');
    console.log('Required env still needed:');
    for (const envName of plan.uniqueMissingEnv) {
      console.log(`- ${envName}`);
    }
  }
  console.log('');
  console.log('Job handoff checklist:');
  for (const [index, job] of plan.jobs.entries()) {
    console.log('');
    console.log(`${index + 1}. ${job.jobId}`);
    console.log(`   Owner: ${job.owner}`);
    console.log(`   Group: ${job.evidenceGroupId}`);
    console.log(`   Mode: ${job.mode}`);
    console.log(`   Run policy: ${job.runPolicy}`);
    console.log(`   Readiness: ${job.executionReadiness}`);
    console.log(`   Required env: ${job.requiredEnv.length === 0 ? 'none' : job.requiredEnv.join(', ')}`);
    console.log(`   Missing env: ${job.missingEnv.length === 0 ? 'none' : job.missingEnv.join(', ')}`);
    console.log(`   Optional env: ${job.optionalEnv.length === 0 ? 'none' : job.optionalEnv.join(', ')}`);
    console.log(`   Preflight violations: ${job.preflightViolations.length === 0 ? 'none' : job.preflightViolations.join(' | ')}`);
    console.log(`   Artifact contract: ${formatHandoffArtifacts(job)}`);
    console.log(`   Runner: ${handoffRunner(job)}`);
    console.log(`   Validators: ${job.validationCommands.join(' && ')}`);
    console.log(`   Operator action: ${handoffAction(job)}`);
    console.log(`   Exit: ${job.exitCondition}`);
  }
}

function printJsonHandoff(plan) {
  console.log(JSON.stringify(buildHandoff(plan), null, 2));
}

function buildHandoff(plan) {
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
      liveExecutionRequires: contract.executionSafety.liveExecutionRequires,
      evidencePathMaxBytes: evidencePathMaxBytes(),
      envValuePolicy: 'names_only',
      evidencePathPolicy: inputMatrix.artifactPathPolicy,
    },
    readiness: {
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
      optionalInputs: buildHandoffInputs(job, job.optionalEnv, job.missingOptionalEnv),
      preflightViolations: job.preflightViolations,
      outputArtifacts: buildHandoffArtifactContracts(job),
      operatorAction: handoffAction(job),
      exitCondition: job.exitCondition,
    })),
  };
}

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
  const missingEnv = job.requiredEnv.filter((envName) => !hasEnv(envName));
  const alternativeEnvNames = new Set((job.requiredEnvAlternatives ?? []).flatMap((alternative) => alternative.env ?? []));
  if (alternativeEnvNames.size === 0 || !hasSatisfiedRequiredEnvAlternative(job)) {
    return missingEnv;
  }

  return missingEnv.filter((envName) => !alternativeEnvNames.has(envName));
}

function missingOptionalEnvNames(job) {
  return job.optionalEnv.filter((envName) => process.env[envName]?.trim() === undefined || process.env[envName]?.trim() === '');
}

function hasSatisfiedRequiredEnvAlternative(job) {
  return (job.requiredEnvAlternatives ?? []).some((alternative) => {
    const envNames = alternative.env ?? [];
    return envNames.length > 0 && envNames.every((envName) => hasEnv(envName));
  });
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
    return 'live_command_executable';
  }
  return 'local_contract_ready';
}

function hasOnlyLocalRuntimeEnvViolations(job, preflightViolations) {
  if (!['staging_artifact', 'staging_deploy'].includes(job.mode)) {
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

function executableJobViolations(candidateJobs) {
  const violations = [];
  violations.push(...duplicateEvidencePathViolations(candidateJobs));
  for (const job of candidateJobs) {
    const missingEnv = missingRequiredEnv(job);
    if (missingEnv.length > 0) {
      violations.push(`${job.jobId}: missing required env ${missingEnv.join(', ')}`);
    }
    validateEvidenceValueEnv(job, new Set(missingEnv), violations);
    validateExecutableOutputArtifactPathEnv(job, new Set(missingEnv), violations);
    if (job.runPolicy === 'manual_artifact_then_validator') {
      violations.push(`${job.jobId}: manual artifact job cannot be executed by this runner`);
    }
  }
  return violations;
}

function planPreflightViolations(candidateJobs) {
  const violations = [];
  violations.push(...duplicateEvidencePathViolations(candidateJobs));
  for (const job of candidateJobs) {
    violations.push(...jobPreflightViolations(job, new Set(missingRequiredEnv(job))));
  }
  return violations;
}

function jobPreflightViolations(job, missingEnvSet) {
  const violations = [];
  validateEvidenceValueEnv(job, missingEnvSet, violations, {
    enabled: contract.executionSafety?.preflightRequiresEnvValueValidation === true,
  });
  validatePlannedEvidencePathEnv(job, missingEnvSet, violations);
  return violations;
}

function artifactValidationViolations(candidateJobs) {
  const violations = [];
  violations.push(...duplicateEvidencePathViolations(candidateJobs));
  for (const job of candidateJobs) {
    const missingEnv = missingRequiredEnv(job);
    const missingEnvSet = new Set(missingEnv);
    if (missingEnv.length > 0) {
      violations.push(`${job.jobId}: missing required env ${missingEnv.join(', ')}`);
    }
    validateEvidenceValueEnv(job, missingEnvSet, violations);
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
      validateArtifactIdentity(content, job, artifact, violations);
      validateArtifactProviderKeys(content, job, artifact, violations);
      validateArtifactEnvConsistency(content, job, artifact.env, violations);
      validateArtifactFreshness(content, job, artifact.env, artifact.format, violations);
    }
  }
  return violations;
}

function duplicateEvidencePathViolations(candidateJobs) {
  return [...duplicateEvidencePathViolationsByJob(candidateJobs).values()].flat();
}

function duplicateEvidencePathViolationsByJob(candidateJobs) {
  const violationsByJob = new Map();
  if (contract.executionSafety?.evidencePathEnvForbidsDuplicatePaths !== true) {
    return violationsByJob;
  }

  const entriesByPath = new Map();
  for (const job of candidateJobs) {
    for (const artifact of job.outputArtifacts ?? []) {
      const envName = artifact.env;
      if (envName === undefined || !envName.endsWith('_PATH')) {
        continue;
      }
      const value = process.env[envName]?.trim();
      if (value === undefined || value === '') {
        continue;
      }

      const duplicateKey = evidencePathDuplicateKey(value);
      const entries = entriesByPath.get(duplicateKey) ?? [];
      entries.push({ jobId: job.jobId, envName });
      entriesByPath.set(duplicateKey, entries);
    }
  }

  for (const entries of entriesByPath.values()) {
    if (entries.length < 2) {
      continue;
    }
    for (const entry of entries) {
      const violations = violationsByJob.get(entry.jobId) ?? [];
      violations.push(`${entry.jobId}: evidence path env ${entry.envName} must not duplicate another evidence artifact path in this run`);
      violationsByJob.set(entry.jobId, violations);
    }
  }

  return violationsByJob;
}

function evidencePathDuplicateKey(path) {
  if (existsSync(path)) {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  }

  const parentDirectory = dirname(path);
  try {
    return resolve(realpathSync(parentDirectory), basename(path));
  } catch {
    return resolve(path);
  }
}

function validateExecutableOutputArtifactPathEnv(job, missingEnvSet, violations) {
  if (contract.executionSafety?.liveExecutionValidatesOutputPathsBeforeRun !== true) {
    return;
  }
  if (job.runPolicy !== 'live_command') {
    return;
  }

  for (const artifact of job.outputArtifacts ?? []) {
    const envName = artifact.env;
    if (envName === undefined || !envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
      continue;
    }

    const value = process.env[envName]?.trim();
    if (value === undefined || value === '') {
      continue;
    }
    if (!isAbsolute(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must be an absolute file path before live execution`);
      continue;
    }
    if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} path must end with .json before live execution`);
      continue;
    }
    if (isFixtureLikeArtifactPath(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must not point to fixture or example evidence before live execution`);
      continue;
    }
    if (isForbiddenWorkspaceEvidencePath(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must not be inside the git workspace before live execution`);
      continue;
    }
    if (!isValidEvidencePathParentDirectory(value, job.jobId, envName, 'before live execution', violations)) {
      continue;
    }
    if (existsSync(value) && requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must point to a regular file before live execution`);
      continue;
    }
    if (existsSync(value) && requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must use 0600-style private file permissions before live execution`);
      continue;
    }
    if (existsSync(value) && isGitTrackedPath(value)) {
      violations.push(`${job.jobId}: output artifact env ${envName} must not point to a git-tracked file before live execution`);
    }
  }
}

function validateEvidenceValueEnv(job, missingEnvSet, violations, options = {}) {
  const enabled = options.enabled ?? contract.executionSafety?.criticalEnvValuesMustBeTyped === true;
  if (!enabled) {
    return;
  }

  const envNames = new Set([...(job.requiredEnv ?? []), ...(job.optionalEnv ?? [])]);
  for (const envName of envNames) {
    if (missingEnvSet.has(envName) || envName.endsWith('_PATH')) {
      continue;
    }

    const value = process.env[envName]?.trim();
    if (value === undefined || value === '') {
      continue;
    }

    if (envName === 'BACKEND_IMAGE_DIGEST' && !/^sha256:[0-9a-f]{64}$/.test(value)) {
      violations.push(`${job.jobId}: env ${envName} must be an immutable sha256 image digest`);
      continue;
    }
    if (envName === 'BACKEND_GIT_COMMIT_SHA' && !/^[0-9a-f]{40}$/.test(value)) {
      violations.push(`${job.jobId}: env ${envName} must be a full 40-character lowercase git commit SHA`);
      continue;
    }
    if (envName === 'API_BASE_URL') {
      validateHttpsEvidenceUrlEnv(job, envName, value, violations);
      continue;
    }
    if (postgresUrlEnvNames().has(envName)) {
      validateTypedUrlEnv(job, envName, value, {
        expectedDescription: 'valid PostgreSQL URL',
        protocols: ['postgres:', 'postgresql:'],
      }, violations);
      continue;
    }
    if (rabbitmqUrlEnvNames().has(envName)) {
      validateTypedUrlEnv(job, envName, value, {
        expectedDescription: 'valid RabbitMQ URL',
        protocols: ['amqp:', 'amqps:'],
      }, violations);
      continue;
    }
    if (httpsEvidenceUrlEnvNames().has(envName)) {
      validateHttpsEvidenceUrlEnv(job, envName, value, violations);
      continue;
    }
    if (tokenEvidenceEnvNames().has(envName)) {
      validateSecretTokenEnv(job, envName, value, violations);
      continue;
    }
    if (secretReferenceEnvNames().has(envName)) {
      validateSecretReferenceEnv(job, envName, value, violations);
      continue;
    }
    if (realEvidenceIdentityEnvNames().has(envName) && isFixtureLikeEnvValue(value)) {
      violations.push(`${job.jobId}: env ${envName} must not use local, fixture, example, mock or test identifiers`);
    }
  }
}

function validateSecretTokenEnv(job, envName, value, violations) {
  if (isPlaceholderSecretValue(value) || value.length < 20 || /\s/.test(value)) {
    violations.push(`${job.jobId}: env ${envName} must be a non-placeholder secret value`);
  }
}

function validateSecretReferenceEnv(job, envName, value, violations) {
  if (isPlaceholderSecretValue(value) || value.length < 8 || isRawSecretValueReference(value)) {
    violations.push(`${job.jobId}: env ${envName} must be a non-placeholder secret reference, not a raw secret value`);
  }
}

function validatePlannedEvidencePathEnv(job, missingEnvSet, violations) {
  if (contract.executionSafety?.preflightRequiresEvidencePathValidation !== true) {
    return;
  }

  const pathEnvNames = new Set([...(job.requiredEnv ?? []), ...(job.optionalEnv ?? [])]);
  for (const envName of pathEnvNames) {
    if (!envName.endsWith('_PATH') || missingEnvSet.has(envName)) {
      continue;
    }

    const value = process.env[envName]?.trim();
    if (value === undefined || value === '') {
      continue;
    }
    if (!isAbsolute(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must be an absolute file path before preflight`);
      continue;
    }
    if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} path must end with .json before preflight`);
      continue;
    }
    if (isFixtureLikeArtifactPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to fixture or example evidence before preflight`);
      continue;
    }
    if (isForbiddenWorkspaceEvidencePath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not be inside the git workspace before preflight`);
      continue;
    }
    if (!isValidEvidencePathParentDirectory(value, job.jobId, envName, 'before preflight', violations)) {
      continue;
    }
    if (!existsSync(value)) {
      continue;
    }
    if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must point to a regular file before preflight`);
      continue;
    }
    if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must use 0600-style private file permissions before preflight`);
      continue;
    }
    if (isOversizedEvidenceFile(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not exceed ${evidencePathMaxBytes()} bytes before preflight`);
      continue;
    }
    if (isGitTrackedPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to a git-tracked file before preflight`);
      continue;
    }

    const realPath = readEvidenceRealPath(value, job.jobId, envName, violations);
    if (realPath === undefined) {
      continue;
    }
    if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must end with .json before preflight`);
      continue;
    }
    if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must point to a regular file before preflight`);
      continue;
    }
    if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must use 0600-style private file permissions before preflight`);
      continue;
    }
    if (isOversizedEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not exceed ${evidencePathMaxBytes()} bytes before preflight`);
      continue;
    }
    if (isFixtureLikeArtifactPath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to fixture or example evidence before preflight`);
      continue;
    }
    if (isForbiddenWorkspaceEvidencePath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not be inside the git workspace before preflight`);
      continue;
    }
    if (isGitTrackedPath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to a git-tracked file before preflight`);
    }
  }
}

function validateHttpsEvidenceUrlEnv(job, envName, value, violations) {
  validateTypedUrlEnv(job, envName, value, {
    expectedDescription: 'valid https URL',
    protocols: ['https:'],
  }, violations);
}

function validateTypedUrlEnv(job, envName, value, options, violations) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    violations.push(`${job.jobId}: env ${envName} must be a ${options.expectedDescription}`);
    return;
  }
  if (!options.protocols.includes(parsed.protocol)) {
    violations.push(`${job.jobId}: env ${envName} must be a ${options.expectedDescription}`);
    return;
  }
  if (isFixtureLikeEnvValue(parsed.hostname)) {
    violations.push(`${job.jobId}: env ${envName} must not use local, fixture, example, mock or test hostnames`);
  }
}

function postgresUrlEnvNames() {
  return new Set(['DATABASE_URL']);
}

function rabbitmqUrlEnvNames() {
  return new Set(['RABBITMQ_URL']);
}

function localRuntimeEnvNames() {
  return new Set(['API_BASE_URL', 'DATABASE_URL', 'RABBITMQ_URL', 'RABBITMQ_MANAGEMENT_URL']);
}

function isLocalRuntimeEnvValue(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  return isFixtureLikeEnvValue(hostname)
    || hostname === 'host.docker.internal'
    || hostname.endsWith('.localhost');
}

function httpsEvidenceUrlEnvNames() {
  return new Set([
    'JWKS_URL',
    'OIDC_ISSUER',
    'RABBITMQ_MANAGEMENT_URL',
    'WEBHOOK_TEST_ENDPOINT',
  ]);
}

function tokenEvidenceEnvNames() {
  return new Set([
    'GITHUB_ACCESS_TOKEN',
    'REDDIT_ACCESS_TOKEN',
    'REDDIT_CLIENT_SECRET',
    'REDDIT_REFRESH_TOKEN',
  ]);
}

function secretReferenceEnvNames() {
  return new Set(['DATABASE_URL_SECRET_REF', 'OIDC_CONFIG_SECRET_REF', 'OIDC_TEST_TOKEN_REF', 'RABBITMQ_URL_SECRET_REF']);
}

function realEvidenceIdentityEnvNames() {
  return new Set([
    'STAGING_ENVIRONMENT_ID',
    'SOURCE_LIVE_ENVIRONMENT_ID',
    'SOURCE_LIVE_OPERATOR',
    'STAGING_SECRET_STORE_ID',
  ]);
}

function isFixtureLikeEnvValue(value) {
  const normalized = String(value).toLowerCase();
  if (
    normalized === 'localhost'
    || normalized === '0.0.0.0'
    || normalized === '::1'
    || normalized === '[::1]'
    || normalized.startsWith('127.')
  ) {
    return true;
  }
  return normalized.split(/[^a-z0-9]+/).some((segment) => {
    return ['local', 'localhost', 'fixture', 'example', 'synthetic', 'mock', 'test'].includes(segment);
  });
}

function isPlaceholderSecretValue(value) {
  const normalized = String(value).trim().toLowerCase();
  if (isFixtureLikeEnvValue(normalized)) {
    return true;
  }
  return [
    'changeme',
    'change-me',
    'dummy',
    'placeholder',
    'redacted',
    'secret',
    'token',
    'todo',
    'undefined',
  ].includes(normalized);
}

function isRawSecretValueReference(value) {
  const normalized = String(value).trim().toLowerCase();
  return [
    'bearer ',
    'basic ',
    'postgres://',
    'postgresql://',
    'amqp://',
    'amqps://',
    'github_pat_',
    'ghp_',
    'sk-proj-',
    'sk-live-',
    'whsec_',
  ].some((fragment) => normalized.startsWith(fragment) || normalized.includes(fragment));
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
    if (!isAbsolute(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must be an absolute file path`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} path must end with .json`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (!existsSync(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must point to an existing file path`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must point to a regular file`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isOversizedEvidenceFile(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not exceed ${evidencePathMaxBytes()} bytes`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isFixtureLikeArtifactPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to fixture or example evidence`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isForbiddenWorkspaceEvidencePath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not be inside the git workspace`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isGitTrackedPath(value)) {
      violations.push(`${job.jobId}: evidence path env ${envName} must not point to a git-tracked file`);
      invalidPathEnv.add(envName);
      continue;
    }
    const realPath = readEvidenceRealPath(value, job.jobId, envName, violations);
    if (realPath === undefined) {
      invalidPathEnv.add(envName);
      continue;
    }
    if (requiresJsonEvidencePathEnv() && !isJsonEvidencePath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must end with .json`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (requiresRegularEvidenceFiles() && !isRegularEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must point to a regular file`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (requiresPrivateEvidenceFileMode() && !isPrivateEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must use 0600-style private file permissions`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isOversizedEvidenceFile(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not exceed ${evidencePathMaxBytes()} bytes`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isFixtureLikeArtifactPath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to fixture or example evidence`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isForbiddenWorkspaceEvidencePath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not be inside the git workspace`);
      invalidPathEnv.add(envName);
      continue;
    }
    if (isGitTrackedPath(realPath)) {
      violations.push(`${job.jobId}: evidence path env ${envName} realpath must not point to a git-tracked file`);
      invalidPathEnv.add(envName);
      continue;
    }

    const violationCount = violations.length;
    validateEvidencePathFileContent(realPath, job.jobId, envName, violations);
    if (violations.length > violationCount) {
      invalidPathEnv.add(envName);
    }
  }

  return invalidPathEnv;
}

function isJsonEvidencePath(path) {
  return path.toLowerCase().endsWith('.json');
}

function requiresJsonOutputArtifactPaths() {
  return contract.executionSafety?.outputArtifactPathEnvRequiresJsonExtension === true;
}

function requiresJsonEvidencePathEnv() {
  return contract.executionSafety?.evidencePathEnvRequiresJsonExtension === true || requiresJsonOutputArtifactPaths();
}

function requiresJsonEvidencePathContent() {
  return contract.executionSafety?.evidencePathEnvRequiresJsonContent === true;
}

function forbidsWorkspaceEvidencePaths() {
  return contract.executionSafety?.evidencePathEnvForbidsWorkspacePath === true;
}

function requiresRegularEvidenceFiles() {
  return contract.executionSafety?.evidencePathEnvRequiresRegularFile === true;
}

function requiresPrivateEvidenceFileMode() {
  return contract.executionSafety?.evidencePathEnvRequiresPrivateFileMode === true;
}

function isRegularEvidenceFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isPrivateEvidenceFile(path) {
  try {
    return (statSync(path).mode & 0o077) === 0;
  } catch {
    return false;
  }
}

function isOversizedEvidenceFile(path) {
  const maxBytes = evidencePathMaxBytes();
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return false;
  }
  try {
    return statSync(path).size > maxBytes;
  } catch {
    return false;
  }
}

function evidencePathMaxBytes() {
  return Number(contract.executionSafety?.evidencePathEnvMaxBytes ?? 0);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 'unbounded';
  }
  return `${bytes} bytes`;
}

function readEvidenceRealPath(path, jobId, envName, violations) {
  try {
    return realpathSync(path);
  } catch {
    violations.push(`${jobId}: evidence path env ${envName} realpath must be readable`);
    return undefined;
  }
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

  const parsed = parseJsonEvidenceContent(content);
  if (!parsed.ok) {
    if (requiresJsonEvidencePathContent()) {
      violations.push(`${jobId}: evidence path env ${envName} must point to valid JSON evidence`);
    }
    return;
  }
  if (!isStructuredJsonEvidence(parsed.value)) {
    if (requiresJsonEvidencePathContent()) {
      violations.push(`${jobId}: evidence path env ${envName} must point to a JSON object or array evidence file`);
    }
    return;
  }
  validateArtifactStructuredRedaction(parsed.value, jobId, `evidence path env ${envName}`, violations);
}

function isFixtureLikeArtifactPath(path) {
  const normalized = path.toLowerCase();
  return forbiddenEvidencePathFragments.some((fragment) => normalized.includes(fragment))
    || normalized.split(/[\\/]+/).some((segment) => isFixtureLikePathSegment(segment));
}

function isFixtureLikePathSegment(segment) {
  return segment.includes('fixture') || segment.includes('example');
}

function isForbiddenWorkspaceEvidencePath(path) {
  if (!forbidsWorkspaceEvidencePaths()) {
    return false;
  }

  const relativePath = relative(process.cwd(), path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isValidEvidencePathParentDirectory(path, jobId, envName, stage, violations) {
  if (contract.executionSafety?.evidencePathEnvRequiresWritableParent !== true) {
    return true;
  }

  const parentDirectory = dirname(path);
  if (!existsSync(parentDirectory)) {
    violations.push(`${jobId}: evidence path env ${envName} parent directory must exist ${stage}`);
    return false;
  }
  let parentRealPath;
  try {
    parentRealPath = realpathSync(parentDirectory);
  } catch {
    violations.push(`${jobId}: evidence path env ${envName} parent directory realpath must be readable ${stage}`);
    return false;
  }
  if (!isRegularDirectory(parentRealPath)) {
    violations.push(`${jobId}: evidence path env ${envName} parent path must be a directory ${stage}`);
    return false;
  }
  if (isForbiddenWorkspaceEvidencePath(parentRealPath)) {
    violations.push(`${jobId}: evidence path env ${envName} parent directory must not be inside the git workspace ${stage}`);
    return false;
  }
  try {
    accessSync(parentRealPath, constants.W_OK);
  } catch {
    violations.push(`${jobId}: evidence path env ${envName} parent directory must be writable ${stage}`);
    return false;
  }
  return true;
}

function isRegularDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
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
    const rawContent = readFileSync(path, 'utf8');
    validateArtifactLiteralRedaction(rawContent, jobId, `output artifact env ${envName}`, violations);
    const content = JSON.parse(rawContent);
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

function validateArtifactIdentity(content, job, artifact, violations) {
  const expectedArtifactId = artifact.expectedArtifactId;
  if (expectedArtifactId === undefined) {
    return;
  }
  if (typeof expectedArtifactId !== 'string' || expectedArtifactId.trim().length === 0) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedArtifactId`);
    return;
  }
  if (content.artifactId !== expectedArtifactId) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} must use artifactId ${expectedArtifactId}`);
  }
}

function validateArtifactProviderKeys(content, job, artifact, violations) {
  if (artifact.expectedProviderKeys === undefined) {
    return;
  }
  if (!Array.isArray(artifact.expectedProviderKeys) || artifact.expectedProviderKeys.length === 0) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedProviderKeys`);
    return;
  }

  const expectedProviderKeys = new Set(artifact.expectedProviderKeys);
  if (expectedProviderKeys.size !== artifact.expectedProviderKeys.length) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has duplicate expectedProviderKeys`);
    return;
  }
  if (![...expectedProviderKeys].every((providerKey) => typeof providerKey === 'string' && providerKey.trim().length > 0)) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} has invalid expectedProviderKeys`);
    return;
  }

  if (!Array.isArray(content.providerResults)) {
    violations.push(`${job.jobId}: output artifact env ${artifact.env} must include providerResults`);
    return;
  }

  const observedProviderKeys = new Set();
  for (const result of content.providerResults) {
    if (typeof result?.providerKey === 'string' && result.providerKey.trim().length > 0) {
      observedProviderKeys.add(result.providerKey.trim());
    }
  }
  for (const providerKey of expectedProviderKeys) {
    if (!observedProviderKeys.has(providerKey)) {
      violations.push(`${job.jobId}: output artifact env ${artifact.env} must include providerKey ${providerKey}`);
    }
  }
  for (const providerKey of observedProviderKeys) {
    if (!expectedProviderKeys.has(providerKey)) {
      violations.push(`${job.jobId}: output artifact env ${artifact.env} must not include providerKey ${providerKey}`);
    }
  }
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
    if (freshness.requiresIso8601Timestamp === true && !isIso8601Timestamp(timestamp.value)) {
      violations.push(`${job.jobId}: output artifact env ${artifactEnv} timestamp ${timestamp.path} must be ISO-8601`);
      continue;
    }
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

function isIso8601Timestamp(value) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
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
      envName: 'BACKEND_GIT_COMMIT_SHA',
      label: 'commitSha',
      paths: [['commitSha'], ['environment', 'commitSha']],
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
  for (const pattern of forbiddenArtifactValuePatterns) {
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      const sensitiveValue = match[1] ?? match[0];
      if (!isRedactedArtifactValue(sensitiveValue)) {
        violations.push(`${jobId}: ${label} must not contain sensitive literal pattern "${pattern.label}"`);
      }
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

function parseJsonEvidenceContent(content) {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false, value: undefined };
  }
}

function isStructuredJsonEvidence(value) {
  return typeof value === 'object' && value !== null;
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
    if (isForbiddenArtifactKey(key) && !isRedactedArtifactValue(child)) {
      findings.push(nextPath.join('.'));
    }
    findings.push(...unredactedSensitiveKeyPaths(child, nextPath));
  }
  return findings;
}

function isForbiddenArtifactKey(key) {
  const normalized = normalizeArtifactKey(key);
  return forbiddenArtifactKeyNames.has(normalized)
    || forbiddenArtifactKeyPatterns.some((pattern) => pattern.test(normalized));
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

function formatRequiredEnvAlternatives(job) {
  const alternatives = job.requiredEnvAlternatives ?? [];
  if (alternatives.length === 0) {
    return 'none';
  }

  return alternatives
    .map((alternative) => {
      const label = typeof alternative.label === 'string' && alternative.label.trim().length > 0
        ? `${alternative.label}: `
        : '';
      return `${label}${(alternative.env ?? []).join(' + ')}`;
    })
    .join(' | ');
}

function formatHandoffArtifacts(job) {
  return job.outputArtifacts
    .map((artifact) => {
      const location = artifact.path ?? `<env:${artifact.env}>`;
      const examplePath = artifactExamplePathByFormat().get(artifact.format);
      const example = examplePath === undefined ? 'no example registered' : `example: ${examplePath}`;
      return `${location} (${artifact.format}; ${example})`;
    })
    .join(', ');
}

function handoffAction(job) {
  if (job.runPolicy === 'local_contract') {
    return `run validators: ${job.validationCommands.join(' && ')}`;
  }
  if (job.runPolicy === 'live_command') {
    return `set required env, run ${job.runnerCommand}, then run ${contract.artifactValidationCommand} -- --job ${job.jobId}`;
  }
  return `collect real redacted artifact files, set artifact path env, then run ${contract.artifactValidationCommand} -- --job ${job.jobId}`;
}

function handoffRunner(job) {
  if (job.runnerCommand !== null) {
    return job.runnerCommand;
  }
  if (job.runPolicy === 'local_contract') {
    return 'validators only';
  }
  return 'manual evidence collection, then artifact validation';
}

function artifactExamplePathByFormat() {
  return new Map((contract.artifactExamples ?? []).map((example) => [example.format, example.path]));
}

function inputMetadataByEnv() {
  const metadata = new Map();
  for (const inputClass of inputMatrix.inputClasses ?? []) {
    for (const envName of inputClass.env ?? []) {
      metadata.set(envName, {
        inputClass: inputClass.inputClass,
        description: inputClass.description,
      });
    }
  }
  return metadata;
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
