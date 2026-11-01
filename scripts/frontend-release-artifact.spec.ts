import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const helper = resolve('ops/ci/build-frontend-release.sh');
const release = 'a'.repeat(40);
let fixture: string;
beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), 'frontend-release-artifact-'));
  for (const path of ['ops/ci', 'apps/frontend/app', 'bin', 'runner']) {
    mkdirSync(join(fixture, path), { recursive: true });
  }
  copyFileSync(helper, join(fixture, 'ops/ci/build-frontend-release.sh'));
  writeFileSync(join(fixture, 'bin/flutter'), `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$RUNNER_TEMP/compiler.log"
origin=; release=
for arg in "$@"; do
  case "$arg" in
    --dart-define=SOCIAL_MONITOR_API_BASE_URL=*) origin=\${arg#*=SOCIAL_MONITOR_API_BASE_URL=} ;;
    --web-define=SOCIAL_MONITOR_RELEASE_ID=*) release=\${arg#*=SOCIAL_MONITOR_RELEASE_ID=} ;;
  esac
done
[[ -n "$origin" && -n "$release" ]]
mkdir -p build/web
printf '%s\\n' "$origin" > build/web/main.dart.js
printf 'self.registration.unregister()' > build/web/flutter_service_worker.js
printf 'flutter_bootstrap.js?v=%s' "$release" > build/web/index.html
printf "const configuredRelease = '%s'" "$release" > build/web/flutter_bootstrap.js
case "\${CORRUPT:-}" in
  origin) echo https://admin.social-monitor.app >> build/web/main.dart.js ;;
  nip) echo unsafe.nip.io >> build/web/main.dart.js ;;
  worker) echo stale > build/web/flutter_service_worker.js ;;
  html) echo unversioned > build/web/index.html ;;
  bootstrap) echo unversioned > build/web/flutter_bootstrap.js ;;
esac
`, { mode: 0o755 });
});
afterEach(() => rmSync(fixture, { recursive: true, force: true }));
const run = (corrupt = '', sha = release) => spawnSync('bash', [join(fixture, 'ops/ci/build-frontend-release.sh')], {
  env: { ...process.env, PATH: join(fixture, 'bin') + ':' + process.env.PATH,
    RUNNER_TEMP: join(fixture, 'runner'), GITHUB_SHA: sha, CORRUPT: corrupt },
  encoding: 'utf8',
});

describe('production frontend artifact build helper', () => {
  it('is invoked by the workflow below the existing source line cap', () => {
    const workflow = readFileSync('.github/workflows/production-deploy.yml', 'utf8');
    expect(workflow).toContain('run: bash ops/ci/build-frontend-release.sh');
    expect(workflow).not.toContain('flutter build web');
    expect(workflow.trimEnd().split('\n').length).toBeLessThan(1000);
  });
  it('builds both origins with matching immutable identity and archives both lanes', () => {
    expect(run().status).toBe(0);
    const log = readFileSync(join(fixture, 'runner/compiler.log'), 'utf8').trim().split('\n');
    expect(log).toHaveLength(2);
    for (const [index, origin] of ['https://social-monitor.app', 'https://admin.social-monitor.app'].entries()) {
      expect(log[index]).toBe(`build web --release --wasm --no-web-resources-cdn --dart-define=SOCIAL_MONITOR_API_BASE_URL=${origin} --web-define=SOCIAL_MONITOR_RELEASE_ID=${release}`);
    }
    const archive = spawnSync('tar', ['-tzf', join(fixture, 'runner/social-monitor-frontend-release.tgz')], { encoding: 'utf8' });
    expect(archive.status).toBe(0);
    for (const lane of ['public', 'admin']) {
      expect(archive.stdout).toContain(`${lane}/release-sha.txt`);
      expect(readFileSync(join(fixture, `runner/social-monitor-frontend-release/${lane}/release-sha.txt`), 'utf8')).toBe(release + '\n');
    }
  });
  it.each(['origin', 'nip', 'worker', 'html', 'bootstrap'])('rejects a bundle with invalid %s contract', (corrupt) => {
    expect(run(corrupt).status).not.toBe(0);
  });
  it('rejects an invalid release identity before calling Flutter', () => {
    expect(run('', 'invalid').status).not.toBe(0);
  });
});
