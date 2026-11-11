import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSourceLiveSmokeScriptContracts } from './source-live-smoke-script-contracts.mjs';

const pathNames = [
  "liveOpenScriptPath",
  "liveOpenCaptureScriptPath",
  "redditLiveScriptPath",
  "redditLiveCaptureScriptPath",
  "redditOAuthLocalCallbackScriptPath",
  "githubRepoRadarLiveScriptPath",
  "githubRepoRadarPrismaLiveE2eScriptPath",
  "githubTrendingPageLiveScriptPath",
  "githubTrendingPageCaptureScriptPath",
  "redditSourceProviderPath",
  "redditRefreshTokenProviderPath",
  "liveEvidenceArtifactHelperPath"
];

function harness({ excludedMarkers = {}, redditOutput = '', readFailure = null, forbiddenPersistence = false } = {}) {
  const reads = [];
  const violations = [];
  const paths = Object.fromEntries(pathNames.map((name) => [name, name]));
  const requiredProviderSignals = new Map([
    ['hacker-news', ['hacker-news-live-signal']],
    ['rss', ['rss-live-signal']],
    ['github-issues', ['github-issues-live-signal']],
    ['github-repo-radar', ['repo-radar-live-signal']],
    ['github-trending-page', ['trending-live-signal']],
    ['reddit', ['reddit-live-signal']],
  ]);
  const { validateLiveSmokeScriptContracts } = createSourceLiveSmokeScriptContracts({
    ...paths,
    readFileSync(path, encoding) {
      reads.push({ path, encoding });
      if (readFailure === path) throw new Error('synthetic read failure');
      return {
        includes(marker) {
          // The real checked script does not contain this forbidden token persistence.
          if (marker === "['REDDIT_ACCESS_TOKEN', credential") return forbiddenPersistence;
          return !(excludedMarkers[path] ?? []).includes(marker);
        },
        toString() {
          return path === paths.redditLiveScriptPath ? redditOutput : '';
        },
      };
    },
    requiredProviderSignals,
    violations,
    liveArtifactFormat: 'source-live-provider-evidence-v1',
  });
  return { validateLiveSmokeScriptContracts, reads, violations, paths };
}

test('reads all original 12 contracts once, at invocation time, with utf8', () => {
  const subject = harness();
  assert.deepEqual(subject.reads, []);
  subject.validateLiveSmokeScriptContracts();
  assert.deepEqual(subject.reads, pathNames.map((path) => ({ path, encoding: 'utf8' })));
  assert.deepEqual(subject.violations, []);
});

test('rejects missing Hacker News signal with original path diagnosis', () => {
  const subject = harness({ excludedMarkers: { liveOpenScriptPath: ['hacker-news-live-signal'] } });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('liveOpenScriptPath') && v.includes('signalId "hacker-news-live-signal"')));
});

test('rejects missing open-connector credentialless evidence handoff marker', () => {
  const subject = harness({ excludedMarkers: { liveOpenCaptureScriptPath: ['LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH'] } });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('liveOpenCaptureScriptPath') && v.includes('credentialless evidence env handoff')));
});

test('rejects missing Reddit refresh-token provider capability', () => {
  const subject = harness({ excludedMarkers: { redditSourceProviderPath: ['refreshTokenProvider'] } });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('redditSourceProviderPath') && v.includes('refreshTokenProvider')));
});

test('rejects missing private writer file-mode protection', () => {
  const subject = harness({ excludedMarkers: { liveEvidenceArtifactHelperPath: ['mode: 0o600'] } });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('liveEvidenceArtifactHelperPath') && v.includes('mode: 0o600')));
});

test('rejects explicitly skipped Reddit access-token smoke', () => {
  const subject = harness({ redditOutput: 'SKIPPED: REDDIT_ACCESS_TOKEN is not set' });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('must not skip missing REDDIT_ACCESS_TOKEN')));
});

test('keeps original read failure propagation without masking as success', () => {
  const subject = harness({ readFailure: 'redditOAuthLocalCallbackScriptPath' });
  assert.throws(() => subject.validateLiveSmokeScriptContracts(), /synthetic read failure/);
  assert.equal(subject.reads.at(-1).path, 'redditOAuthLocalCallbackScriptPath');
});

test('rejects missing shared writer call even when other markers exist', () => {
  const subject = harness({ excludedMarkers: { githubTrendingPageLiveScriptPath: ['writeLiveEvidenceArtifactAtomically'] } });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((v) => v.includes('githubTrendingPageLiveScriptPath') && v.includes('shared private evidence artifact writer')));
});

test('rejects callback persisting a short-lived Reddit token', () => {
  const subject = harness({ forbiddenPersistence: true });
  subject.validateLiveSmokeScriptContracts();
  assert.ok(subject.violations.some((value) =>
    value.includes('redditOAuthLocalCallbackScriptPath') &&
    value.includes('must not persist short-lived REDDIT_ACCESS_TOKEN')));
});
