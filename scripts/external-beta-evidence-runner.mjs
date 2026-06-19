import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const contractPath = 'ops/release/external-beta-evidence-runner.json';
const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const requireEnv = args.includes('--require-env');
const json = args.includes('--json');
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

if (!execute) {
  const plan = buildPlan(jobs);
  if (json) {
    printJsonPlan(plan);
  } else {
    printPlan(plan);
  }
  if (requireEnv && plan.missingEnvCount > 0) {
    process.exit(1);
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
  }

  for (const command of job.validationCommands) {
    runCommand(command, `${job.jobId}: validation`);
  }
}

function buildPlan(planJobs) {
  const plan = {
    runnerId: contract.runnerId,
    mode: execute ? 'execute' : 'plan_only',
    jobCount: planJobs.length,
    missingEnvCount: 0,
    uniqueMissingEnv: [],
    jobs: [],
  };

  for (const job of planJobs) {
    const missingEnv = missingRequiredEnv(job);
    plan.jobs.push({
      jobId: job.jobId,
      evidenceGroupId: job.evidenceGroupId,
      mode: job.mode,
      runPolicy: job.runPolicy,
      owner: job.owner,
      runnerCommand: job.runnerCommand,
      validationCommands: job.validationCommands,
      requiredEnv: job.requiredEnv,
      missingEnv,
      outputArtifacts: job.outputArtifacts,
      exitCondition: job.exitCondition,
    });
    plan.missingEnvCount += missingEnv.length;
  }
  plan.uniqueMissingEnv = [...new Set(plan.jobs.flatMap((job) => job.missingEnv))].sort();

  return plan;
}

function printPlan(plan) {
  console.log(`External beta evidence plan (${contract.runnerId})`);
  console.log(`Mode: ${plan.mode}`);
  console.log(`Jobs: ${plan.jobCount}`);

  for (const job of plan.jobs) {
    console.log('');
    console.log(`${job.jobId}`);
    console.log(`  group: ${job.evidenceGroupId}`);
    console.log(`  mode: ${job.mode}`);
    console.log(`  runPolicy: ${job.runPolicy}`);
    console.log(`  owner: ${job.owner}`);
    console.log(`  runner: ${job.runnerCommand ?? 'manual artifact / validators only'}`);
    console.log(`  validators: ${job.validationCommands.join(' && ')}`);
    console.log(`  requiredEnv: ${job.requiredEnv.length === 0 ? 'none' : job.requiredEnv.join(', ')}`);
    console.log(`  missingEnv: ${job.missingEnv.length === 0 ? 'none' : job.missingEnv.join(', ')}`);
    console.log(`  outputArtifacts: ${formatOutputArtifacts(job)}`);
    console.log(`  exit: ${job.exitCondition}`);
  }

  if (plan.missingEnvCount > 0) {
    console.log('');
    console.log(`Missing required env count: ${plan.missingEnvCount}`);
  }
}

function printJsonPlan(plan) {
  console.log(JSON.stringify(plan, null, 2));
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
