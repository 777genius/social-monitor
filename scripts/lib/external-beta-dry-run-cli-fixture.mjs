// Execute the real CLI against synthetic contracts, never a live runner.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function dryRunCliFixture() {
  const root = mkdtempSync(join(tmpdir(), 'social-monitor-dry-run-e2e-'));
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(root, 'ops', 'release'), { recursive: true });
  copyFileSync(new URL('../check-external-beta-evidence-dry-run.mjs', import.meta.url),
    join(root, 'scripts', 'check-external-beta-evidence-dry-run.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-plan-policy.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-plan-policy.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-handoff-policy.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-handoff-policy.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-safety-linkage-policy.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-safety-linkage-policy.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-package-admission.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-package-admission.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-job-identity.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-job-identity.mjs'));
  copyFileSync(new URL('./external-beta-dry-run-clean-env-runtime.mjs', import.meta.url),
    join(root, 'scripts', 'lib', 'external-beta-dry-run-clean-env-runtime.mjs'));
  writeFileSync(join(root, 'scripts', 'external-beta-evidence-runner.mjs'),
    "import { readFileSync } from 'node:fs';\n" +
    "const args = process.argv.slice(2).join(' ');\n" +
    "const file = args === '--plan --json' ? 'plan.json' : args === '--handoff-json' ? 'handoff.json' : null;\n" +
    "if (!file) { process.stderr.write('unexpected runner operation'); process.exit(91); }\n" +
    "if (process.env.EXTERNAL_BETA_EVIDENCE_CONFIRM || process.env.EXTERNAL_BETA_SECRET_SENTINEL) { process.stderr.write('unfiltered child environment'); process.exit(92); }\n" +
    "process.stdout.write(readFileSync(file, 'utf8'));\n");
  const runner = {
    runnerId: 'synthetic-dry-run', jsonPlanCommand: 'node runner --plan --json',
    handoffCommand: 'node runner --handoff', handoffJsonCommand: 'node runner --handoff-json',
    summaryCommand: 'node runner --summary', preflightCommand: 'node runner --preflight',
    artifactValidationCommand: 'node runner --validate', currentPackageCommand: 'node checker',
    executionSafety: { forbiddenTargets: [] }, jobs: [], artifactExamples: [],
  };
  const dryRun = {
    schemaVersion: 1, scope: 'backend-only', frontendPolicy: 'deferred_contract_only',
    defaultMode: 'plan_only', notEvidence: true, doesNotUnblockExternalBeta: true,
    sourceRunnerContract: 'ops/release/external-beta-evidence-runner.json',
    sourceReadinessContract: 'ops/release/external-beta-readiness-contract.json',
    envExample: 'ops/release/example.env',
    planJsonCommand: runner.jsonPlanCommand, handoffCommand: runner.handoffCommand,
    handoffJsonCommand: runner.handoffJsonCommand, summaryCommand: runner.summaryCommand,
    preflightCommand: runner.preflightCommand,
    artifactValidationCommand: runner.artifactValidationCommand,
    currentPackageCommand: runner.currentPackageCommand,
    liveExecutionTemplate: 'EXTERNAL_BETA_EVIDENCE_CONFIRM=run-live node runner --execute',
    expectedPlanCountsWithoutCredentials: { jobCount: 0 },
    requiredJobIds: [], requiredMissingEnvWithoutCredentials: [],
    requiredReadinessStatesWithoutCredentials: [], requiredArtifactFormats: [], forbiddenTargets: [],
  };
  const plan = {
    runnerId: runner.runnerId, mode: 'plan_only', jobCount: 0, jobs: [],
    uniqueMissingEnv: [], uniqueMissingOptionalEnv: [], readinessCounts: {},
    localContractJobCount: 0, contractClosurePercent: 0, executableLiveJobCount: 0,
    manualArtifactReadyForValidationJobCount: 0, liveCommandJobCount: 0,
    manualArtifactJobCount: 0, externalEvidenceEnvReadinessPercent: 0,
    externalBlockerJobCount: 0, blockedMissingRequiredEnvJobCount: 0,
    blockedInvalidInputJobCount: 0, blockedLocalRuntimeEnvJobCount: 0,
  };
  const handoff = {
    runnerId: runner.runnerId, scope: dryRun.scope, frontendPolicy: dryRun.frontendPolicy,
    envTemplate: dryRun.envExample,
    inputMatrix: {
      matrixId: 'external-beta-evidence-input-matrix-v1', secretValuePolicy: 'never_commit_values',
      artifactPathPolicy: 'absolute_json_private_0600_non_workspace_non_fixture_path',
    },
    safety: {
      handoffJsonCommand: dryRun.handoffJsonCommand,
      currentPackageCommand: dryRun.currentPackageCommand, envValuePolicy: 'names_only',
      evidencePathPolicy: 'absolute_json_private_0600_non_workspace_non_fixture_path',
    },
    readiness: {
      localContractJobs: 0, totalJobs: 0, contractClosurePercent: 0,
      externalEvidenceReadyJobs: 0, externalEvidenceTotalJobs: 0,
      externalEvidenceEnvReadinessPercent: 0, externalBlockerJobCount: 0,
      blockedMissingRequiredEnvJobCount: 0, blockedInvalidInputJobCount: 0,
      blockedLocalRuntimeEnvJobCount: 0, uniqueMissingEnv: [], uniqueMissingOptionalEnv: [],
    },
    jobs: [],
  };
  const readiness = {
    externalBetaDecision: 'hold', evidenceMode: 'fixture_contract_with_external_evidence_required',
    evidenceRunner: {
      contract: 'ops/release/external-beta-evidence-runner.json',
      jsonPlanCommand: dryRun.planJsonCommand,
      handoffJsonCommand: dryRun.handoffJsonCommand,
      currentPackageCommand: dryRun.currentPackageCommand,
    },
  };
  function write(relative, value) {
    writeFileSync(join(root, relative), JSON.stringify(value));
  }
  const save = () => {
    write('ops/release/external-beta-evidence-dry-run.json', dryRun);
    write('ops/release/external-beta-evidence-runner.json', runner);
    write('ops/release/external-beta-readiness-contract.json', readiness);
    write('ops/release/backend-safe-verify-contract.json',
      { backendScripts: ['check:external-beta-evidence-dry-run'] });
    write('ops/release/release-baseline-contract.json', {
      requiredGreenScripts: ['check:external-beta-evidence-dry-run'],
      trackedArtifacts: [{ path: 'ops/release/external-beta-evidence-dry-run.json' }],
    });
    write('package.json', { scripts: {
      'check:external-beta-evidence-dry-run': 'node scripts/check-external-beta-evidence-dry-run.mjs',
    } });
    write('plan.json', plan);
    write('handoff.json', handoff);
    writeFileSync(join(root, 'ops', 'release', 'example.env'), '');
  };
  const run = (parentEnv = {}) => {
    save();
    return spawnSync(process.execPath, ['scripts/check-external-beta-evidence-dry-run.mjs'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { PATH: process.env.PATH ?? '', ...parentEnv },
    });
  };
  return { runner, dryRun, readiness, plan, handoff, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
