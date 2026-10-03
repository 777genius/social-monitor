type Mapping = Record<string, unknown>;
const CHECKOUT = 'actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10';
const NODE = 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
const UPLOAD = 'actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f';
const ENABLED = "steps.mode.outputs.enabled == 'true'";
const MODE = [
  'set -euo pipefail', 'case "${HETZNER_RELEASE_MODE:-}" in',
  "  preflight|manual|auto) printf 'enabled=true\\n' >> \"$GITHUB_OUTPUT\" ;;",
  "  *) printf 'enabled=false\\n' >> \"$GITHUB_OUTPUT\"; printf 'Hetzner release: disabled-skipped\\n' >> \"$GITHUB_STEP_SUMMARY\" ;;",
  'esac',
].join('\n');
const MAIN = [
  'set -euo pipefail', 'umask 077', 'test "$GITHUB_REPOSITORY" = 777genius/social-monitor',
  'test ! -e "$GH_CONFIG_DIR"', 'mkdir -m 700 "$GH_CONFIG_DIR"',
  "trap 'rm -rf -- \"$GH_CONFIG_DIR\"' EXIT",
  'observed="$(timeout 60 gh api --hostname github.com --method GET repos/777genius/social-monitor/git/ref/heads/main --jq \'if .ref == "refs/heads/main" and .object.type == "commit" then .object.sha else error("main") end\' 2>/dev/null)"',
  '[[ "$observed" =~ ^[0-9a-f]{40}$ ]]', "printf 'sha=%s\\n' \"$observed\" >> \"$GITHUB_OUTPUT\"",
].join('\n');
const HEAD = ['set -euo pipefail', '[[ "$TRUSTED_MAIN" =~ ^[0-9a-f]{40}$ ]]',
  'test "$(git rev-parse --verify HEAD)" = "$TRUSTED_MAIN"'].join('\n');
const SCRIPT = 'node --experimental-strip-types scripts/ci/hetzner-release-observe.mts ';
const BASE_ENV = { GH_TOKEN: '${{ github.token }}',
  GH_CONFIG_DIR: '${{ runner.temp }}/hetzner-gh-${{ github.job }}',
  HETZNER_RELEASE_MODE: '${{ vars.HETZNER_RELEASE_MODE }}', TRUSTED_MAIN: '${{ steps.main.outputs.sha }}' };
const EXPECTED_ENV = { ...BASE_ENV, EXPECTED_SHA: '${{ needs.candidate.outputs.sha }}',
  EXPECTED_RUN: '${{ needs.candidate.outputs.run }}', EXPECTED_ARTIFACT: '${{ needs.candidate.outputs.artifact }}',
  EXPECTED_MANIFEST_HASH: '${{ needs.candidate.outputs.manifest_hash }}', EXPECTED_LANE: '${{ needs.candidate.outputs.lane }}' };
function common(): Mapping[] {
  return [
    { name: 'Require explicitly configured mode', id: 'mode', shell: 'bash',
      env: { HETZNER_RELEASE_MODE: '${{ vars.HETZNER_RELEASE_MODE }}' }, run: MODE },
    { name: 'Independently observe current main', id: 'main', if: ENABLED, shell: 'bash',
      env: { GH_TOKEN: BASE_ENV.GH_TOKEN, GH_CONFIG_DIR: BASE_ENV.GH_CONFIG_DIR }, run: MAIN },
    { name: 'Check out trusted main', if: ENABLED, uses: CHECKOUT,
      with: { repository: '777genius/social-monitor', ref: 'main', 'fetch-depth': 1,
        'persist-credentials': false, submodules: false, lfs: false } },
    { name: 'Verify trusted checkout before executing scripts', if: ENABLED, shell: 'bash',
      env: { TRUSTED_MAIN: BASE_ENV.TRUSTED_MAIN }, run: HEAD },
    { name: 'Set up Node 22', if: ENABLED, uses: NODE, with: { 'node-version': 22 } },
  ];
}
function host(lane: 'preflight' | 'activate'): Mapping {
  const run = ['set -euo pipefail', 'umask 077',
    'private="$(mktemp -d "$RUNNER_TEMP/hetzner-private-XXXXXXXX")"',
    "trap 'rm -rf -- \"$private\"' EXIT", 'export HETZNER_PRIVATE_DIRECTORY="$private"', SCRIPT + lane].join('\n');
  return { needs: 'candidate',
    if: `needs.candidate.outputs.phase == 'ready' && needs.candidate.outputs.lane == '${lane}'`,
    concurrency: { group: 'social-monitor-hetzner-production', 'cancel-in-progress': false },
    'runs-on': 'ubuntu-latest', 'timeout-minutes': lane === 'preflight' ? 30 : 45,
    environment: 'production-hetzner', permissions: { actions: 'read', contents: 'read' },
    steps: [...common(),
      { name: 'Independently authorize the host phase', id: 'gate', if: ENABLED, env: EXPECTED_ENV, run: SCRIPT + 'gate' },
      { name: lane === 'preflight' ? 'Observe bounded host preflight' : 'Deliver through the existing bounded client',
        if: `steps.gate.outputs.phase == 'ready' && steps.gate.outputs.lane == '${lane}'`, shell: 'bash',
        env: { ...EXPECTED_ENV, HETZNER_HOST: '${{ vars.HETZNER_HOST }}', HETZNER_PORT: '${{ vars.HETZNER_PORT }}',
          HETZNER_PRIVATE_KEY: '${{ secrets.HETZNER_PRIVATE_KEY }}', HETZNER_KNOWN_HOSTS: '${{ secrets.HETZNER_KNOWN_HOSTS }}' }, run },
      { name: lane === 'preflight' ? 'Preserve finite preflight receipt' : 'Preserve finite activation receipt',
        if: 'always()', uses: UPLOAD,
        with: { name: `hetzner-${lane}-\${{ github.run_id }}`, path: [
          '${{ runner.temp }}/hetzner-receipts-${{ github.job }}/receipt.jsonl',
          '${{ runner.temp }}/hetzner-receipts-${{ github.job }}/phases.jsonl'].join('\n'),
        'if-no-files-found': 'ignore', 'retention-days': 90 } },
    ] };
}
function expected(): Mapping {
  return { name: 'Hetzner release', on: {
    workflow_run: { workflows: ['Pull request checks'], types: ['completed'] },
    workflow_dispatch: { inputs: {
      ci_run_id: { description: 'Exact successful main push CI run ID', required: true, type: 'string' },
      action: { description: 'Explicit bounded release action', required: true, default: 'preflight',
        type: 'choice', options: ['preflight', 'activate', 'rollback-previous'] },
      rollback_sha: { description: 'Full activation receipt SHA; rollback currently denies', required: false, default: '', type: 'string' },
    } } }, permissions: {},
    jobs: { candidate: { 'runs-on': 'ubuntu-latest', 'timeout-minutes': 30, permissions: { actions: 'read', contents: 'read' },
      outputs: { phase: "${{ steps.candidate.outputs.phase || 'disabled-skipped' }}", lane: "${{ steps.candidate.outputs.lane || 'skip' }}",
        sha: '${{ steps.candidate.outputs.sha }}', run: '${{ steps.candidate.outputs.run }}',
        artifact: '${{ steps.candidate.outputs.artifact }}', manifest_hash: '${{ steps.candidate.outputs.manifest_hash }}' },
      steps: [...common(), { name: 'Verify and download candidate data', id: 'candidate', if: ENABLED, env: BASE_ENV, run: SCRIPT + 'candidate' }] },
    preflight: host('preflight'), activate: host('activate') } };
}
function mapping(value: unknown): value is Mapping {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
// Caller supplies parsed YAML. This bounded workflow allowlist rejects extra
// jobs/env/permissions/commands and enforces the exact approved action/step order.
export function releaseWorkflowViolations(value: unknown): string[] {
  const violations: string[] = [];
  function compare(actual: unknown, wanted: unknown, path: string): void {
    if (violations.length >= 100) return;
    if (Array.isArray(wanted)) {
      if (!Array.isArray(actual) || actual.length !== wanted.length) {
        violations.push(`${path}: exact finite sequence required`); return;
      }
      wanted.forEach((item, i) => compare(actual[i], item, `${path}[${i}]`)); return;
    }
    if (mapping(wanted)) {
      if (!mapping(actual)) { violations.push(`${path}: mapping required`); return; }
      if (Object.keys(actual).sort().join(',') !== Object.keys(wanted).sort().join(',')) {
        violations.push(`${path}: exact allowed keys required`);
      }
      for (const key of Object.keys(wanted)) compare(actual[key], wanted[key], `${path}.${key}`);
      return;
    }
    const normalized = typeof actual === 'string' && (path.endsWith('.run') || path.endsWith('.path')) ? actual.trim() : actual;
    if (normalized !== wanted) violations.push(`${path}: approved value required`);
  }
  compare(value, expected(), 'hetzner-release'); return violations;
}
