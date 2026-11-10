import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface FrontendBundle {
  readonly lane: 'public' | 'admin';
  readonly sourceSha: string;
  readonly ciRunId: string;
  readonly ciRunAttempt: string;
  readonly apiOrigin: string;
}
interface FrontendArtifactManifest {
  readonly version: 1;
  readonly sourceSha: string;
  readonly ciRunId: string;
  readonly ciRunAttempt: string;
  readonly archive: { readonly name: string; readonly sha256: string; readonly bytes: number };
  readonly bundles: readonly FrontendBundle[];
}

const sha = process.env.GITHUB_SHA;
const run = process.env.GITHUB_RUN_ID;
const attempt = process.env.GITHUB_RUN_ATTEMPT;
const root = process.env.RUNNER_TEMP;
if (!sha || !/^[a-f0-9]{40}$/.test(sha) || !run || !/^[1-9][0-9]*$/.test(run) ||
    !attempt || !/^[1-9][0-9]*$/.test(attempt) || !root) {
  throw new Error('Invalid frontend release identity');
}
const archive = readFileSync(join(root, 'frontend-release.tgz'));
const manifest: FrontendArtifactManifest = {
  version: 1, sourceSha: sha, ciRunId: run, ciRunAttempt: attempt,
  archive: { name: 'frontend-release.tgz',
    sha256: createHash('sha256').update(archive).digest('hex'), bytes: archive.length },
  bundles: [
    { lane: 'public', sourceSha: sha, ciRunId: run, ciRunAttempt: attempt, apiOrigin: 'https://social-monitor.app' },
    { lane: 'admin', sourceSha: sha, ciRunId: run, ciRunAttempt: attempt, apiOrigin: 'https://admin.social-monitor.app' },
  ],
};
writeFileSync(join(root, 'frontend-manifest.json'), `${JSON.stringify(manifest)}\n`, { flag: 'wx' });
