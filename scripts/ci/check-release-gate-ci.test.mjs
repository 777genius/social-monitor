import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { releaseGateCiViolations } from '../check-review-ci.mjs';

const source = readFileSync(new URL('../../.github/workflows/pull-request.yml', import.meta.url), 'utf8');
const gate = (w) => w.jobs.static_quality.steps.find((step) => step.env?.RELEASE_GATE_VENV);
const join = (w) => w.jobs.static_quality.steps.at(-1);
const assets = () => Object.fromEntries(['root', 'runner', 'keeper'].map((key) => [key,
  readFileSync(new URL(`../../ops/ci/static-quality-${key === 'keeper' ? 'group-keeper' : key}.${key === 'root' ? 'sh' : 'mts'}`, import.meta.url), 'utf8')]));
const nativeCommands = [
  '/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-e2e-driver_test.py',
  '/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-e2e-fixture/operator_test.py',
  '/root/social-monitor-release-contract-tests/python/bin/python3 -I -B /root/social-monitor-release-contract-tests/ops/ci/release-database-plan_test.py',
];
const replace = (before, after) => (w, files) => {
  const owner = [gate(w), join(w)].find((step) => step.run?.includes(before));
  if (owner) owner.run = owner.run.replace(before, after);
  else {
    const key = Object.keys(files).find((key) => files[key].includes(before));
    assert.ok(key, `absent mutation target: ${before}`);
    files[key] = files[key].replace(before, after);
  }
};

test('required controller gate accepts current and equivalent parsed YAML', () => {
  assert.deepEqual(releaseGateCiViolations(source), []);
  const doc = yaml.load(source, { schema: yaml.JSON_SCHEMA });
  gate(doc).run = '# explanatory comment\n' + gate(doc).run.split('\n').map((line) => `  ${line}`).join('\n');
  assert.deepEqual(releaseGateCiViolations(yaml.dump(Object.fromEntries(Object.entries(doc).reverse()), { flowLevel: 5 })), []);
});

for (const [label, mutate] of [
  ['missing required job', (w) => delete w.jobs.static_quality],
  ['changed required check name', (w) => w.jobs.static_quality.name = 'Optional quality'],
  ['unrequired controller job', (w) => {
    w.jobs.optional = { steps: [gate(w)] };
    w.jobs.static_quality.steps = w.jobs.static_quality.steps.filter((step) => step !== gate(w));
  }],
  ['gate skip', (w) => gate(w).if = false],
  ['gate failure ignored', (w) => gate(w)['continue-on-error'] = true],
  ['job failure ignored', (w) => w.jobs.static_quality['continue-on-error'] = true],
  ['job skip', (w) => w.jobs.static_quality.if = false],
  ...['job', 'workflow'].map((scope) => [
    `${scope} default shell masks controller failure`, (w) => {
      const owner = scope === 'job' ? w.jobs.static_quality : w;
      owner.defaults = { run: { shell: 'bash --noprofile --norc -c "bash {0} || true"' } };
    },
  ]),
  ['serial unit dependency', (w) => w.jobs.static_quality.needs = ['backend_unit']],
  ['self-hosted root execution', (w) => w.jobs.static_quality['runs-on'] = 'self-hosted'],
  ['production environment', (w) => w.jobs.static_quality.environment = 'production'],
  ['production credential', (w) => gate(w).env.TOKEN = '${{ secrets.PRODUCTION_TOKEN }}'],
  ['persisted checkout credentials', (w) => w.jobs.static_quality.steps[0].with['persist-credentials'] = true],
  ['wrong checkout revision', (w) => w.jobs.static_quality.steps[0].with.ref = 'main'],
  ['second checkout before gate', (w) => w.jobs.static_quality.steps.splice(1, 0, globalThis.structuredClone(w.jobs.static_quality.steps[0]))],
  ['second checkout after gate', (w) => w.jobs.static_quality.steps.push(globalThis.structuredClone(w.jobs.static_quality.steps[0]))],
  ['unpinned gate checkout', (w) => w.jobs.static_quality.steps[0].uses = 'actions/checkout@main'],
  ['unexpected checkout options', (w) => w.jobs.static_quality.steps[0].with.path = 'other-source'],
  ['startup injection before gate', (w) => w.jobs.static_quality.steps.splice(1, 0, { run: 'echo BASH_ENV=startup.sh >> "$GITHUB_ENV"' })],
  ...['workflow', 'job', 'gate'].flatMap((scope) => ['BASH_ENV', 'PATH'].map((key) => [
    `unexpected ${key} in ${scope} environment`, (w) => {
      const owner = scope === 'workflow' ? w : scope === 'job' ? w.jobs.static_quality : gate(w);
      owner.env = { ...owner.env, [key]: 'untrusted-override' };
    },
  ])),

  ['floating runner distro', (w) => w.jobs.static_quality['runs-on'] = 'ubuntu-latest'],
  ['toolcache Python instead of system ABI', replace('/usr/bin/python3.12 -m venv', 'python3 -m venv')],
  ['wrong system Python', replace('/usr/bin/python3.12 -m venv', '/usr/bin/python3.13 -m venv')],
  ['toolcache Python setup shadows system prerequisite', (w) => w.jobs.static_quality.steps.splice(1, 0, {
    uses: 'actions/setup-python@5fda3b95a4ea91299a34e894583c3862153e4b97', with: { 'python-version': '3.12' },
  })],
  ['venv outside runner temp', (w) => gate(w).env.RELEASE_GATE_VENV = '/usr/local/venv'],
  ['missing root', replace("command: '/usr/bin/sudo'", "command: '/usr/bin/env'")],
  ['sudo drops venv PATH', replace('PATH=/root/social-monitor-release-contract-tests/python/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'PATH=/usr/bin:/bin')],
  ['symlinked venv Python', replace(' --copies', '')],
  ['unlocked dependency install', replace(' --require-hashes', '')],
  ['wrong dependency lock', replace('hetzner/requirements.txt', 'requirements.txt')],
  ['system pip', replace('"$RELEASE_GATE_VENV/bin/python3" -m pip', 'python3 -m pip')],
  ['missing ShellCheck', replace('command -v shellcheck\n', '')],
  ['missing Compose', replace('docker compose version\n', '')],
  ["uncached native catalog image", replace("docker pull postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722\n", "")],
  ["mutable native catalog image", replace("docker pull postgres@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722", "docker pull postgres:18")],
  ["existing or symlinked staging root accepted", replace("sudo test ! -e /root/social-monitor-release-contract-tests\n", "")],
  ["missing root scratch", replace(" /root/social-monitor-release-contract-tests/node_modules", "")],
  ["runner-owned staging source", replace("sudo cp -R ops/release/hetzner /root/social-monitor-release-contract-tests/ops/release/", "cp -R ops/release/hetzner /root/social-monitor-release-contract-tests/ops/release/")],
  ["preserved source ownership", replace("sudo cp -R ops/release/hetzner", "sudo cp -a ops/release/hetzner")],
  ["missing copied trusted Python", replace("sudo cp -R \"$RELEASE_GATE_VENV\" /root/social-monitor-release-contract-tests/python\n", "")],
  ["runner-owned controller execution", replace("/usr/bin/bash --noprofile --norc /root/social-monitor-release-contract-tests/ops/release/hetzner/check.sh", "bash ops/release/hetzner/check.sh")],
  ['missing workflow authority input', replace('sudo cp .github/workflows/pull-request.yml /root/social-monitor-release-contract-tests/.github/workflows/\n', '')],
  ['missing native import geometry', replace('sudo cp -R ops/ci /root/social-monitor-release-contract-tests/ops/\n', '')],
  ['runner-owned native staging', replace('sudo cp -R ops/ci ', 'cp -R ops/ci ')],
  ['wrong native staging geometry', replace('sudo cp -R ops/ci /root/social-monitor-release-contract-tests/ops/', 'sudo cp -R ops/ci /root/social-monitor-release-contract-tests/')],
  ...nativeCommands.flatMap((command) => [
    [`missing ${command}`, replace(`${command}\n`, '')],
    [`duplicate ${command}`, (w, files) => files.root += `${command}\n`],
    [`separate duplicate ${command}`, (w) => w.jobs.static_quality.steps.push({ run: command })],
    [`optional duplicate ${command}`, (w) => w.jobs.optional = { steps: [{ if: false, run: command }] }],
    [`system Python for ${command}`, replace(command, command.replace('/root/social-monitor-release-contract-tests/python/bin/python3', '/usr/bin/python3.12'))],
    [`missing isolation for ${command}`, replace(command, command.replace(' -I -B ', ' -B '))],
    [`bytecode writes for ${command}`, replace(command, command.replace(' -I -B ', ' -I '))],
    [`runner-owned source for ${command}`, replace(command, command.replace('/root/social-monitor-release-contract-tests/ops/ci/', 'ops/ci/'))],
    [`before core gate ${command}`, (w, files) => {
      const core = '/usr/bin/bash --noprofile --norc /root/social-monitor-release-contract-tests/ops/release/hetzner/check.sh';
      replace(`${command}\n`, '')(w, files);
      replace(core, `${command}\n${core}`)(w, files);
    }],
  ]),
  ["missing pinned fixture ops/deploy/reader-summary-publication-pre-migration.sql", replace("sudo cp ops/deploy/reader-summary-publication-pre-migration.sql /root/social-monitor-release-contract-tests/ops/deploy/\n", '')],
  ["missing pinned fixture ops/deploy/reader-summary-publication-post-migration.sql", replace("sudo cp ops/deploy/reader-summary-publication-post-migration.sql /root/social-monitor-release-contract-tests/ops/deploy/\n", '')],
  ["missing pinned fixture scripts/sql/reader-summary-publication-tenant-ownership.sql", replace("sudo cp scripts/sql/reader-summary-publication-tenant-ownership.sql /root/social-monitor-release-contract-tests/scripts/sql/\n", '')],
  ['duplicate native source copy', (w) => w.jobs.static_quality.steps.push({
    run: 'sudo cp -R ops/ci /root/social-monitor-release-contract-tests/ops/',
  })],
  ['shared-host root execution', replace('test "${RUNNER_ENVIRONMENT:-}" = "$CI_NATIVE_ENVIRONMENT"\n', '')],
  ['masked contract failure', (w) => gate(w).run += ' || true\n'],
  ['early successful exit', (w) => gate(w).run = 'exit 0\n' + gate(w).run],
  ['folded command boundaries', (w) => gate(w).run = gate(w).run.replaceAll('\n', ' ')],
  ['writable root snapshot', replace('sudo chmod -R go-w /root/social-monitor-release-contract-tests', 'sudo chmod -R a+w /root/social-monitor-release-contract-tests')],
  ['symlinked privileged helper', replace('sudo test ! -L /root/social-monitor-release-contract-tests/ops/ci/static-quality-root.sh\n', '')],
  ['runner PATH used by root', replace('PATH=/root/social-monitor-release-contract-tests/python/bin:/usr/sbin:/usr/bin:/sbin:/bin', 'PATH=/opt/hostedtoolcache/node/22/bin:/usr/bin')],
  ['root startup injection', replace("'/usr/bin/env', '-i'", "'/usr/bin/env', 'BASH_ENV=checkout.sh'")],
  ['privileged command from environment', replace('checks = """', 'checks = os.environ["COMMAND"] # """')],
  ['root wait removed', replace('child.wait(timeout=5)', 'pass')],
  ['root termination unbounded', replace('child.wait(timeout=5)', 'child.wait()')],
  ['root escalation removed', replace('os.killpg(child.pid, signal.SIGKILL)', 'pass')],
  ['root keeper reaped before escalation', replace('status = int(report)', 'child.poll(); status = int(report)')],
  ['root keeper stops holding group', replace('signal.pause()', 'sys.exit(0)')],
  ['root actual status lost', replace('sys.exit(143 if cancelled else status)', 'sys.exit(0)')],
  ['root EOF cancellation removed', replace('os.read(3, 1)\n            cancelled = True', 'os.read(3, 1)')],
  ['root ShellCheck optional', replace('hetzner/check.sh\n', 'hetzner/check.sh || true\n')],
  ['early join on child failure', replace('Promise.allSettled', 'Promise.all')],
  ['missing joined results', replace("results.every((result) => result.status === 'fulfilled' && result.value === 0)", 'true')],
  ['missing log drain', replace('await logResult', 'true')],
  ['missing Node cancellation', replace("process.on('SIGTERM', onTerm);", '')],
  ['missing owned child termination', replace("kill('SIGTERM');", '')],
  ['foreign process termination', replace('process.kill(-child.pid, signal)', 'process.kill(-1, signal)')],
  ['missing keeper', (_w, files) => delete files.keeper],
  ['keeper ignores command result', replace("child.once('exit', (code) => report({ type: 'status', status: code ?? 1 }));", "child.once('exit', () => report({ type: 'status', status: 0 }));")],
  ['keeper exits before group drain', replace("child.once('exit', (code) => report({ type: 'status', status: code ?? 1 }));", "child.once('exit', () => process.exit(0));")],
  ['keeper disconnect cleanup removed', replace("process.on('disconnect', drain);", '')],
  ['keeper TERM immunity removed', replace("process.on('SIGTERM', () => {});", '')],
  ['completion does not start drain', replace('commandStatus = report.status;\n          stop();', 'commandStatus = report.status;')],
  ...['if', 'continue-on-error', 'working-directory', 'shell', 'env'].map((key) => [
    `join injection through ${key}`, (w) => join(w)[key] = key === 'continue-on-error' ? true : 'untrusted',
  ]),
  ['optional duplicate root helper', (w) => w.jobs.optional = { steps: [{ if: false, run: 'sudo bash /root/social-monitor-release-contract-tests/ops/ci/static-quality-root.sh' }] }],
  ['optional duplicate runner with different flags', (w) => w.jobs.optional = { steps: [{ if: false, run: 'node ops/ci/static-quality-runner.mts' }] }],
  ['separate optional join', (w) => w.jobs.optional = { steps: [globalThis.structuredClone(join(w))] }],
  ['join detached across steps', (w) => { join(w).run += '\nwait\n'; }],
  ['join failure masked', (w) => { join(w).run += '\nexit 0\n'; }],
  ['join tee masks failure', (w) => { join(w).run = join(w).run.replace(" <<'STATIC_QUALITY'", " | tee joined.log <<'STATIC_QUALITY'"); }],
  ...['npx eslint .', 'npx tsc --noEmit', 'npx tsc -p ops/ci/tsconfig.historical-bootstrap.json',
    'npm run check:architecture', 'npm run check:code-quality', 'npm run check:source-line-cap',
    'npm run check:persistence-readiness', 'npm run check:observability', 'npm run check:review-ci',
    'node --test scripts/ci/*.test.mjs'].flatMap((command) => [
    [`missing static ${command}`, replace(`${command}\n`, '')],
    [`duplicate static ${command}`, replace(`${command}\n`, `${command}\n${command}\n`)],
    [`optional static ${command}`, replace(command, `${command} || true`)],
  ]),
  ['scans moved after fixture-creating Node tests', replace('npx eslint .', 'node --test scripts/ci/*.test.mjs')],
  ...[2, 3, 4, 5, 6].flatMap((index) => [
    [`missing prerequisite step ${index}`, (w) => w.jobs.static_quality.steps.splice(index, 1)],
    [`optional prerequisite step ${index}`, (w) => w.jobs.static_quality.steps[index].if = false],
    [`startup injection step ${index}`, (w) => w.jobs.static_quality.steps[index].env = { BASH_ENV: 'evil.sh' }],
  ]),
  ...['npx tsc -p ops/ci/tsconfig.static-quality.json', 'shellcheck ops/ci/static-quality-root.sh',
    'node --experimental-strip-types --test ops/ci/static-quality-runner.test.mts',
    'node --test scripts/ci/check-release-gate-ci.test.mjs'].map((command) => [
    `missing pre-join proof ${command}`, (w) => {
      const step = w.jobs.static_quality.steps[6];
      assert.ok(step.run.includes(command)); step.run = step.run.replace(`${command}\n`, '');
    },
  ]),
]) {
  test(`required controller gate rejects ${label}`, () => {
    const doc = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    const files = assets();
    mutate(doc, files);
    assert.notDeepEqual(releaseGateCiViolations(yaml.dump(doc), files), []);
  });
}

test('malformed or duplicate-key YAML cannot satisfy the controller gate', () => {
  assert.match(releaseGateCiViolations('jobs: [')[0], /invalid YAML/u);
  assert.match(releaseGateCiViolations(`${source}\nname: duplicate\n`)[0], /invalid YAML/u);
});
