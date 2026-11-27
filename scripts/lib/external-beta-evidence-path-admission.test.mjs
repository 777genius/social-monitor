import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  accessSync, chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdirSync,
  mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync,
  symlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse as parseDotenv } from 'dotenv';
import { createExternalBetaEvidencePathAdmission } from './external-beta-evidence-path-admission.mjs';
import { createExternalBetaEnvFileLoader } from './external-beta-evidence-env-file-loader.mjs';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const safety = JSON.parse(readFileSync(join(repository, 'ops/release/external-beta-evidence-runner.json'), 'utf8')).executionSafety;
const job = {
  jobId: 'path-admission', runPolicy: 'live_command', mode: 'staging_artifact',
  requiredEnv: ['OUTPUT_PATH'], optionalEnv: [], validationCommands: [],
  runnerCommand: 'npm run produce', blocksExternalBeta: true,
  outputArtifacts: [{ env: 'OUTPUT_PATH', format: 'path-admission-proof' }],
};

function sandbox(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'external-beta-path-admission-')));
  const workspace = join(root, 'workspace');
  const evidence = join(root, 'private');
  mkdirSync(workspace);
  mkdirSync(evidence);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = {};
  let currentDirectory = workspace;
  const contract = { executionSafety: globalThis.structuredClone(safety) };
  const dependencies = {
    contract, env, cwd: () => currentDirectory,
    jobInputEnvNames: item => [...item.requiredEnv, ...item.optionalEnv],
    accessSync, existsSync, lstatSync, readFileSync, realpathSync: realpathSync.native, statSync,
    execFileSync: () => { throw Object.assign(new Error('untracked sandbox evidence'), { status: 1 }); },
    writableMode: constants.W_OK,
  };
  return {
    root, workspace, evidence, env, contract, dependencies,
    policy: createExternalBetaEvidencePathAdmission(dependencies),
    setCwd: value => { currentDirectory = value; },
  };
}

function writePrivate(path, content = '{"schemaVersion":1}') {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

function stage(policy, name, missing = []) {
  const violations = [];
  const invalid = policy[name](job, new Set(missing), violations);
  return { violations, invalid };
}

test('missing output is allowed for plan/live and required for artifact validation', t => {
  const s = sandbox(t);
  s.env.OUTPUT_PATH = join(s.evidence, 'future.json');
  assert.deepStrictEqual(stage(s.policy, 'validatePlannedEvidencePathEnv').violations, []);
  assert.deepStrictEqual(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations, []);
  const result = stage(s.policy, 'validateEvidencePathEnv');
  assert.deepStrictEqual(result.violations, [
    'path-admission: evidence path env OUTPUT_PATH must point to an existing file path',
  ]);
  assert.deepStrictEqual([...result.invalid], ['OUTPUT_PATH']);
});

test('private evidence passes all stages and injected env/contract/cwd remain live', t => {
  const s = sandbox(t);
  s.env.OUTPUT_PATH = writePrivate(join(s.evidence, 'capture.json'));
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
    assert.deepStrictEqual(stage(s.policy, name).violations, []);
  }
  s.setCwd(s.evidence);
  assert.match(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations[0], /inside the git workspace/);
  s.contract.executionSafety.evidencePathEnvForbidsWorkspacePath = false;
  assert.deepStrictEqual(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations, []);
  s.env.OUTPUT_PATH = 'relative.json';
  assert.deepStrictEqual(stage(s.policy, 'validateExecutableOutputArtifactPathEnv', ['OUTPUT_PATH']).violations, []);
  assert.match(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations[0], /absolute file path/);
});

test('Git lookup failures reject evidence in every admission stage without exposing child output', t => {
  const s = sandbox(t);
  s.contract.executionSafety.evidencePathEnvForbidsWorkspacePath = false;
  s.env.OUTPUT_PATH = writePrivate(join(s.workspace, 'capture.json'));
  const envFile = writePrivate(join(s.workspace, 'private.env'), 'SAFE_MODE=enabled\n');
  for (const failure of [{ code: 'ENOENT' }, { status: 128 }, { status: null, signal: 'SIGTERM' }]) {
    const policy = createExternalBetaEvidencePathAdmission({
      ...s.dependencies,
      execFileSync: () => { throw Object.assign(new Error('private child output'), failure); },
    });
    for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
      assert.throws(() => stage(policy, name), {
        message: 'Cannot verify whether evidence path is git-tracked',
      });
    }
    assert.throws(() => policy.validateExternalBetaEnvFilePath(envFile, '--env-file', []), {
      message: 'Cannot verify whether evidence path is git-tracked',
    });
  }
});

test('Git no-match is admitted while tracked evidence is rejected', t => {
  const s = sandbox(t);
  s.contract.executionSafety.evidencePathEnvForbidsWorkspacePath = false;
  s.env.OUTPUT_PATH = writePrivate(join(s.workspace, 'capture.json'));
  const envFile = writePrivate(join(s.workspace, 'private.env'), 'SAFE_MODE=enabled\n');
  for (const tracked of [false, true]) {
    const policy = createExternalBetaEvidencePathAdmission({
      ...s.dependencies,
      execFileSync: () => {
        if (!tracked) throw Object.assign(new Error('no match'), { status: 1 });
        return '';
      },
    });
    for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
      const { violations } = stage(policy, name);
      if (tracked) assert.match(violations[0], /must not point to a git-tracked file/);
      else assert.deepStrictEqual(violations, []);
    }
    const violations = [];
    policy.validateExternalBetaEnvFilePath(envFile, '--env-file', violations);
    if (tracked) assert.match(violations[0], /must not point to a git-tracked file/);
    else assert.deepStrictEqual(violations, []);
  }
});

test('existing output aliases cannot target workspace, fixture or non-JSON files', t => {
  const s = sandbox(t);
  const fixtureDirectory = join(s.root, 'fixtures');
  mkdirSync(fixtureDirectory);
  for (const [target, diagnostic] of [
    [join(s.workspace, 'protected.json'), 'realpath must not be inside the git workspace'],
    [join(fixtureDirectory, 'capture.json'), 'realpath must not point to fixture or example evidence'],
    [join(s.evidence, 'capture.txt'), 'realpath must end with .json'],
  ]) {
    writePrivate(target);
    const alias = join(s.evidence, 'alias.json');
    symlinkSync(target, alias);
    s.env.OUTPUT_PATH = alias;
    assert.ok(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations.some(value => value.includes(diagnostic)));
    assert.equal(readFileSync(target, 'utf8'), '{"schemaVersion":1}');
    rmSync(alias);
  }
});

test('symlink parent traversal cannot admit workspace evidence in any stage', t => {
  const s = sandbox(t);
  const child = join(s.workspace, 'child');
  mkdirSync(child);
  symlinkSync(child, join(s.evidence, 'link'), 'dir');
  for (const directory of [s.workspace, s.evidence]) {
    writePrivate(join(directory, 'capture.json'));
    writePrivate(join(directory, 'private.env'), 'SAFE_MODE=workspace-test-value\n');
  }
  // Preserve .. after the symlink: path.join would erase the traversal being tested.
  s.env.OUTPUT_PATH = `${s.evidence}/link/../capture.json`;
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
    assert.ok(stage(s.policy, name).violations.some(value => value.includes('inside the git workspace')), name);
  }
  let reads = 0;
  const loader = createExternalBetaEnvFileLoader({
    parseDotenv, env: s.env, validateExternalBetaEnvFilePath: s.policy.validateExternalBetaEnvFilePath,
    readFileSync: (...args) => { reads += 1; return readFileSync(...args); },
  });
  assert.ok(loader.loadExternalBetaEnvFiles([`${s.evidence}/link/../private.env`])
    .some(value => value.includes('inside the git workspace')));
  assert.equal(reads, 0);
  assert.equal(s.env.SAFE_MODE, undefined);
});

test('safe symlink parent traversal admits existing evidence and future outputs', t => {
  const s = sandbox(t);
  const child = join(s.evidence, 'child');
  mkdirSync(child);
  symlinkSync(child, join(s.root, 'parent-alias'), 'dir');
  writePrivate(join(s.evidence, 'capture.json'));
  s.env.OUTPUT_PATH = `${s.root}/parent-alias/../capture.json`;
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
    assert.deepStrictEqual(stage(s.policy, name).violations, []);
  }
  s.env.OUTPUT_PATH = `${s.root}/parent-alias/../future.json`;
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv']) {
    assert.deepStrictEqual(stage(s.policy, name).violations, []);
  }
});

test('Git tracking is checked in the injected workspace independently of the caller directory', t => {
  const s = sandbox(t);
  execFileSync('git', ['init', '--quiet'], { cwd: s.workspace });
  s.contract.executionSafety.evidencePathEnvForbidsWorkspacePath = false;
  s.env.OUTPUT_PATH = writePrivate(join(s.workspace, 'capture.json'));
  const policy = createExternalBetaEvidencePathAdmission({ ...s.dependencies, execFileSync });
  assert.deepStrictEqual(stage(policy, 'validateEvidencePathEnv').violations, []);
  execFileSync('git', ['add', 'capture.json'], { cwd: s.workspace });
  assert.match(stage(policy, 'validateEvidencePathEnv').violations[0], /must not point to a git-tracked file/);
});

test('dangling output aliases are rejected while genuinely absent files stay allowed', t => {
  const s = sandbox(t);
  const missing = join(s.workspace, 'missing.json');
  s.env.OUTPUT_PATH = join(s.evidence, 'dangling.json');
  symlinkSync(missing, s.env.OUTPUT_PATH);
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv']) {
    assert.deepStrictEqual(stage(s.policy, name).violations, [
      'path-admission: evidence path env OUTPUT_PATH realpath must be readable',
    ]);
  }
  assert.equal(existsSync(missing), false);
});

test('safe ancestor aliases remain valid while workspace and fixture parent aliases reject', t => {
  const s = sandbox(t);
  const fixtureDirectory = join(s.root, 'fixtures');
  mkdirSync(fixtureDirectory);
  for (const [directory, expected] of [
    [s.evidence, null],
    [s.workspace, 'parent directory must not be inside the git workspace'],
    [fixtureDirectory, 'parent directory must not point to fixture or example evidence'],
  ]) {
    const parentAlias = join(s.root, 'parent-alias');
    symlinkSync(directory, parentAlias, 'dir');
    s.env.OUTPUT_PATH = join(parentAlias, 'future.json');
    for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv']) {
      const { violations } = stage(s.policy, name);
      if (expected === null) assert.deepStrictEqual(violations, []);
      else assert.ok(violations.some(value => value.includes(expected)));
    }
    rmSync(parentAlias);
  }
});

test('workspace children beginning with two dots remain inside the workspace', t => {
  const s = sandbox(t);
  const child = join(s.workspace, '..cache');
  mkdirSync(child);
  s.env.OUTPUT_PATH = writePrivate(join(child, 'capture.json'));
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
    assert.ok(stage(s.policy, name).violations.some(value => value.includes('inside the git workspace')));
  }
  const path = writePrivate(join(child, 'evidence.env'), 'SAFE_MODE=enabled\n');
  const violations = [];
  s.policy.validateExternalBetaEnvFilePath(path, '--env-file', violations);
  assert.deepStrictEqual(violations, ['--env-file: path must not be inside the git workspace']);
});

test('private mode, regular files, bounded size and writable parents keep stage semantics', t => {
  const s = sandbox(t);
  s.env.OUTPUT_PATH = writePrivate(join(s.evidence, 'capture.json'));
  chmodSync(s.env.OUTPUT_PATH, 0o644);
  for (const name of ['validatePlannedEvidencePathEnv', 'validateExecutableOutputArtifactPathEnv', 'validateEvidencePathEnv']) {
    assert.ok(stage(s.policy, name).violations.some(value => value.includes('0600-style private file permissions')));
  }
  chmodSync(s.env.OUTPUT_PATH, 0o600);
  s.contract.executionSafety.evidencePathEnvMaxBytes = 4;
  assert.match(stage(s.policy, 'validatePlannedEvidencePathEnv').violations[0], /must not exceed 4 bytes/);
  assert.match(stage(s.policy, 'validateEvidencePathEnv').violations[0], /must not exceed 4 bytes/);
  // A producer may replace its prior output; live-output admission does not read its content.
  assert.deepStrictEqual(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations, []);
  const blockedParentPolicy = createExternalBetaEvidencePathAdmission({
    ...s.dependencies, accessSync: () => { throw new Error('read-only parent'); },
  });
  assert.match(stage(blockedParentPolicy, 'validateExecutableOutputArtifactPathEnv').violations[0], /parent directory must be writable/);
  s.env.OUTPUT_PATH = join(s.evidence, 'directory.json');
  mkdirSync(s.env.OUTPUT_PATH);
  assert.match(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations[0], /must point to a regular file/);
});

test('artifact validation still parses JSON and records invalid inputs before semantic validation', t => {
  const s = sandbox(t);
  s.env.OUTPUT_PATH = writePrivate(join(s.evidence, 'capture.json'), 'not-json');
  const result = stage(s.policy, 'validateEvidencePathEnv');
  assert.deepStrictEqual(result.violations, ['path-admission: evidence path env OUTPUT_PATH must point to valid JSON evidence']);
  assert.deepStrictEqual([...result.invalid], ['OUTPUT_PATH']);
});

test('env-file aliases reject forbidden final targets before loading any content', t => {
  const s = sandbox(t);
  const fixtureDirectory = join(s.root, 'fixtures');
  mkdirSync(fixtureDirectory);
  for (const target of [join(s.workspace, 'private.env'), join(fixtureDirectory, 'private.env')]) {
    writePrivate(target, 'SAFE_MODE=enabled\n');
    const alias = join(s.evidence, 'alias.env');
    symlinkSync(target, alias);
    let reads = 0;
    const loader = createExternalBetaEnvFileLoader({
      parseDotenv, env: s.env, validateExternalBetaEnvFilePath: s.policy.validateExternalBetaEnvFilePath,
      readFileSync: (...args) => { reads += 1; return readFileSync(...args); },
    });
    assert.ok(loader.loadExternalBetaEnvFiles([alias]).some(value => value.includes('realpath must not')));
    assert.equal(reads, 0);
    assert.equal(s.env.SAFE_MODE, undefined);
    rmSync(alias);
  }
});

test('valid private env-file alias loads into the same live environment', t => {
  const s = sandbox(t);
  const target = writePrivate(join(s.evidence, 'private.env'), 'OUTPUT_PATH=' + join(s.evidence, 'future.json') + '\n');
  const alias = join(s.root, 'alias.env');
  symlinkSync(target, alias);
  const loader = createExternalBetaEnvFileLoader({
    parseDotenv, env: s.env, readFileSync,
    validateExternalBetaEnvFilePath: s.policy.validateExternalBetaEnvFilePath,
  });
  assert.deepStrictEqual(loader.loadExternalBetaEnvFiles([alias]), []);
  assert.equal(s.env.OUTPUT_PATH, join(s.evidence, 'future.json'));
  assert.deepStrictEqual(stage(s.policy, 'validateExecutableOutputArtifactPathEnv').violations, []);
});

test('unreadable canonical targets fail closed without hiding metadata errors as absent files', t => {
  const s = sandbox(t);
  s.env.OUTPUT_PATH = writePrivate(join(s.evidence, 'capture.json'));
  const policy = createExternalBetaEvidencePathAdmission({
    ...s.dependencies,
    realpathSync: path => {
      if (path === s.env.OUTPUT_PATH) throw new Error('unreadable target');
      return realpathSync(path);
    },
  });
  assert.match(stage(policy, 'validateExecutableOutputArtifactPathEnv').violations[0], /realpath must be readable/);
  const inaccessiblePolicy = createExternalBetaEvidencePathAdmission({
    ...s.dependencies,
    existsSync: path => path === s.env.OUTPUT_PATH ? false : existsSync(path),
    lstatSync: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); },
  });
  assert.match(stage(inaccessiblePolicy, 'validateExecutableOutputArtifactPathEnv').violations[0], /realpath must be readable/);
});

function cliSandbox(t) {
  const s = sandbox(t);
  const scripts = join(s.workspace, 'scripts');
  mkdirSync(join(scripts, 'lib'), { recursive: true });
  copyFileSync(join(repository, 'scripts/external-beta-evidence-runner.mjs'), join(scripts, 'external-beta-evidence-runner.mjs'));
  for (const name of readdirSync(join(repository, 'scripts/lib'))) {
    if (name.startsWith('external-beta-') && name.endsWith('.mjs') && !name.endsWith('.test.mjs')) {
      copyFileSync(join(repository, 'scripts/lib', name), join(scripts, 'lib', name));
    }
  }
  symlinkSync(join(repository, 'node_modules'), join(s.workspace, 'node_modules'), 'dir');
  const release = join(s.workspace, 'ops/release');
  mkdirSync(release, { recursive: true });
  writeFileSync(join(release, 'external-beta-evidence-runner.json'), JSON.stringify({
    schemaVersion: 1, runnerId: 'isolated-path-admission', jobs: [job],
    executionSafety: safety, artifactFreshness: {
      requiredTimestampFormats: [], maxArtifactAgeHours: 168, maxArtifactFutureSkewMinutes: 10,
    },
  }));
  writeFileSync(join(release, 'external-beta-evidence-input-matrix.json'), '{"inputs":[]}');
  writeFileSync(join(s.workspace, 'package.json'), JSON.stringify({
    name: 'isolated-path-admission', private: true, scripts: { produce: 'node marker-producer.mjs' },
  }));
  writeFileSync(join(s.workspace, 'marker-producer.mjs'), [
    "import { writeFileSync } from 'node:fs';",
    "writeFileSync('producer-invoked', 'yes');",
    "writeFileSync(process.env.OUTPUT_PATH, JSON.stringify({ schemaVersion: 1, format: 'path-admission-proof' }), { mode: 0o600 });",
  ].join('\n'));
  return {
    ...s,
    run: (args, env = {}) => spawnSync(process.execPath, ['scripts/external-beta-evidence-runner.mjs', ...args], {
      cwd: s.workspace, encoding: 'utf8', timeout: 30_000,
      env: { PATH: process.env.PATH ?? '', ...env },
    }),
  };
}

test('real CLI rejects a final workspace symlink before producer dispatch or overwrite', t => {
  const s = cliSandbox(t);
  const target = writePrivate(join(s.workspace, 'protected.json'), '{"untouched":true}');
  const alias = join(s.evidence, 'output.json');
  symlinkSync(target, alias);
  const result = s.run(['--execute'], { EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live', OUTPUT_PATH: alias });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /realpath must not be inside the git workspace before live execution/);
  assert.equal(existsSync(join(s.workspace, 'producer-invoked')), false);
  assert.equal(readFileSync(target, 'utf8'), '{"untouched":true}');
});

test('real CLI rejects dangling output aliases without creating target or invoking producer', t => {
  const s = cliSandbox(t);
  const target = join(s.workspace, 'missing.json');
  const alias = join(s.evidence, 'output.json');
  symlinkSync(target, alias);
  const result = s.run(['--execute'], { EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live', OUTPUT_PATH: alias });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /realpath must be readable/);
  assert.equal(existsSync(join(s.workspace, 'producer-invoked')), false);
  assert.equal(existsSync(target), false);
});

test('real CLI rejects env-file workspace aliases before parsing or echoing their values', t => {
  const s = cliSandbox(t);
  const target = writePrivate(join(s.workspace, 'private.env'), 'SAFE_MODE=private-content-must-stay-unread\n');
  const alias = join(s.evidence, 'alias.env');
  symlinkSync(target, alias);
  const result = s.run(['--plan', '--json', '--env-file', alias]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /realpath must not be inside the git workspace/);
  assert.doesNotMatch(result.stdout + result.stderr, /private-content-must-stay-unread/);
});

test('real CLI rejects symlink parent traversal in plan, artifact and execute admission', t => {
  const s = cliSandbox(t);
  const child = join(s.workspace, 'child');
  mkdirSync(child);
  symlinkSync(child, join(s.evidence, 'link'), 'dir');
  const target = writePrivate(join(s.workspace, 'protected.json'), '{"untouched":true}');
  writePrivate(join(s.evidence, 'protected.json'));
  const output = `${s.evidence}/link/../protected.json`;
  for (const args of [['--plan', '--require-env'], ['--validate-artifacts'], ['--execute']]) {
    const result = s.run(args, { EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live', OUTPUT_PATH: output });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /inside the git workspace/);
    assert.equal(existsSync(join(s.workspace, 'producer-invoked')), false);
    assert.equal(readFileSync(target, 'utf8'), '{"untouched":true}');
  }
});

test('real CLI rejects env-file symlink parent traversal before loading values', t => {
  const s = cliSandbox(t);
  const child = join(s.workspace, 'child');
  mkdirSync(child);
  symlinkSync(child, join(s.evidence, 'link'), 'dir');
  writePrivate(join(s.workspace, 'private.env'), 'SAFE_MODE=workspace-value-must-stay-unread\n');
  writePrivate(join(s.evidence, 'private.env'), 'SAFE_MODE=outside-test-value\n');
  const result = s.run(['--plan', '--json', '--env-file', `${s.evidence}/link/../private.env`]);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /realpath must not be inside the git workspace/);
  assert.doesNotMatch(result.stdout + result.stderr, /workspace-value-must-stay-unread/);
});

test('real CLI accepts a future output through a safe parent alias and live env-file injection', t => {
  const s = cliSandbox(t);
  const parentAlias = join(s.root, 'parent-alias');
  symlinkSync(s.evidence, parentAlias, 'dir');
  const output = join(parentAlias, 'capture.json');
  const envFile = writePrivate(join(s.evidence, 'input.env'), 'OUTPUT_PATH=' + output + '\n');
  const result = s.run(['--execute', '--env-file', envFile], { EXTERNAL_BETA_EVIDENCE_CONFIRM: 'run-live' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(s.workspace, 'producer-invoked'), 'utf8'), 'yes');
  assert.deepStrictEqual(JSON.parse(readFileSync(output, 'utf8')), {
    schemaVersion: 1, format: 'path-admission-proof',
  });
});
