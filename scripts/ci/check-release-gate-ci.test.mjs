import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { releaseGateCiViolations } from '../check-review-ci.mjs';

const source = readFileSync(new URL('../../.github/workflows/pull-request.yml', import.meta.url), 'utf8');
const gate = (w) => w.jobs.static_quality.steps.find((step) => step.run?.includes('ops/release/hetzner/check.sh'));
const replace = (before, after) => (w) => {
  assert.ok(gate(w).run.includes(before), `absent mutation target: ${before}`);
  gate(w).run = gate(w).run.replace(before, after);
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
  ['missing root', replace('sudo env ', 'env ')],
  ['sudo drops venv PATH', replace('PATH="/root/social-monitor-release-contract-tests/python/bin:$PATH" ', '')],
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
  ["runner-owned controller execution", replace("bash /root/social-monitor-release-contract-tests/ops/release/hetzner/check.sh", "bash ops/release/hetzner/check.sh")],
  ['shared-host root execution', replace('test "${RUNNER_ENVIRONMENT:-}" = github-hosted\n', '')],
  ['masked contract failure', (w) => gate(w).run += ' || true\n'],
  ['early successful exit', (w) => gate(w).run = 'exit 0\n' + gate(w).run],
  ['folded command boundaries', (w) => gate(w).run = gate(w).run.replaceAll('\n', ' ')],
]) {
  test(`required controller gate rejects ${label}`, () => {
    const doc = yaml.load(source, { schema: yaml.JSON_SCHEMA });
    mutate(doc);
    assert.notDeepEqual(releaseGateCiViolations(yaml.dump(doc)), []);
  });
}

test('malformed or duplicate-key YAML cannot satisfy the controller gate', () => {
  assert.match(releaseGateCiViolations('jobs: [')[0], /invalid YAML/u);
  assert.match(releaseGateCiViolations(`${source}\nname: duplicate\n`)[0], /invalid YAML/u);
});
