import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';

const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8');
const copyManifests = dockerfile.split('\n').filter((line) =>
  /^COPY\s/u.test(line) && /package\.json/u.test(line));

test('npm manifests have deterministic read permissions for the node runtime', () => {
  assert.deepEqual(copyManifests, ['COPY --chmod=0644 package.json package-lock.json ./']);
  assert.match(dockerfile, /^USER node$/mu);
});

test('a restrictive build context still permits non-root npm execution', {
  skip: process.env.SOCIAL_MONITOR_TEST_IMAGE_FILE_MODES !== '1',
  timeout: 180_000,
}, () => {
  const fixture = mkdtempSync(join(tmpdir(), 'sm-manifest-modes-test-'));
  const image = `sm-manifest-modes-test:${randomUUID()}`;
  const base = process.env.SOCIAL_MONITOR_TEST_NODE_IMAGE ?? 'node:22-bookworm-slim';
  assert.match(base, /^[a-zA-Z0-9][a-zA-Z0-9./:_@-]+$/u);
  try {
    writeFileSync(join(fixture, 'package.json'), JSON.stringify({
      name: 'isolated-manifest-permission-fixture', version: '1.0.0', private: true,
      scripts: { probe: 'node -e "process.exit(0)"' },
    }), { mode: 0o600 });
    writeFileSync(join(fixture, 'package-lock.json'), '{}', { mode: 0o600 });
    chmodSync(join(fixture, 'package.json'), 0o600);
    chmodSync(join(fixture, 'package-lock.json'), 0o600);
    writeFileSync(join(fixture, 'Dockerfile'), [
      `FROM ${base}`, 'USER root', 'WORKDIR /app', copyManifests[0], 'USER node',
      'CMD ["npm", "run", "probe"]', '',
    ].join('\n'));
    docker(['build', '--network=none', '--pull=false', '-t', image, fixture]);
    docker(['run', '--rm', '--network=none', '--entrypoint=node', image, '-e', [
      "const fs=require('fs');",
      'if(process.getuid()===0)throw Error("probe must not run as root");',
      'for(const f of ["/app/package.json","/app/package-lock.json"]){',
      'const s=fs.statSync(f);',
      'if((s.mode&0o777)!==0o644||s.uid!==0)throw Error("wrong manifest ownership or mode");',
      'JSON.parse(fs.readFileSync(f,"utf8"));}',
    ].join('')]);
    docker(['run', '--rm', '--network=none', image]);
  } finally {
    spawnSync('docker', ['image', 'rm', image], { encoding: 'utf8', timeout: 30_000 });
    rmSync(fixture, { recursive: true, force: true });
  }
});

function docker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 150_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${args[0]} failed: ${result.stdout}\n${result.stderr}`);
}
