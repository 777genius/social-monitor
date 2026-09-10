'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { absentFilters } = require('./capture-core-observation.cjs');
const { DAYS } = require('./frozen-input.cjs');
const { sha } = require('./revision-source.cjs');
const { syntheticTape } = require('./full-selector-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
// Synthetic structural compatibility only: none of these owner-shaped receipts
// establish independent real capture or model-execution authority.
function captureCoreFixture(mutate = () => {}) {
  const tape = syntheticTape(), raw = tape.files['inputs.json'].snapshot;
  const { tenantId, workspaceId } = tape.files['snapshot-query.json'].query;
  const scope = { tenantId, workspaceId }, cutoff = '2026-09-09T11:47:10.523Z';
  const identity = { commit: 'a'.repeat(40), imageId: `sha256:${'b'.repeat(64)}`, sourceSha256: 'c'.repeat(64) };
  const records = DAYS.map(day => {
    const s = clone(raw);
    s.candidates.forEach(c => {
      c.item.publishedAt = `${day}T12:00:00.000Z`;
      if (c.exactTimestamps) c.exactTimestamps.publishedAt = c.item.publishedAt;
    });
    return { day, startedAt: cutoff, endedAt: cutoff, query: { ...scope,
      windowStartedAt: `${day}T00:00:00.000Z`, windowEndedAt: new Date(Date.parse(`${day}T00:00:00.000Z`) + 86400000).toISOString(),
      timestampPolicy: 'published_at', observedThrough: cutoff }, snapshot: s };
  });
  const ids = [...new Set([...raw.candidates.map(c => c.item), ...raw.supplementalItems].map(i => i.interestId))];
  const controls = { cutoff, scope, queries: records.map(r => ({ day: r.day, timezone: 'UTC', cadence: 'daily',
    rankingQuery: { ...scope, rankingProfile: 'reader_post_promotion', limit: 200, publishedAtOrAfter: r.query.windowStartedAt,
      publishedBefore: r.query.windowEndedAt, observedAtOrBefore: cutoff }, absentFilters })),
  interests: ids.map(interestId => ({ scope: { ...scope, interestId }, readStartedAt: cutoff, readEndedAt: cutoff,
    result: { kind: 'available', interest: { ...scope, interestId, query: 'Synthetic configured interest' } } })) };
  mutate({ records, controls });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'controlled-capture-core-'));
  const write = (file, value) => {
    const bytes = JSON.stringify(value) + '\n';
    fs.writeFileSync(path.join(directory, file), bytes, { mode: 0o600 });
    return { file, sha256: sha(bytes) };
  };
  const ref = r => ({ path: path.join(directory, r.file), sha256: r.sha256 });
  const receipt = { format: 'current-freshness-capture.v1', status: 'capture_only_diagnostics_remaining',
    cutoff, endedAt: cutoff, identity, days: records.map(r => write(`${r.day}.json`, r)), controls: write('controls.json', controls),
    limitations: ['Synthetic fixture; no real observation'] };
  const receiptRef = ref(write('capture-receipt.json', receipt));
  const host = { format: 'current-freshness-host-receipt.v1', status: 'capture_container_completed', identity,
    captureReceiptSha256: receiptRef.sha256, capturedThrough: cutoff,
    container: { Image: identity.imageId, State: { Status: 'exited', ExitCode: 0 } } };
  const hostRef = ref(write('host-receipt.json', host));
  const preflight = { format: 'current-freshness-preflight.v1', status: 'complete', cutoff, scope, identity,
    captureReceiptSha256: receiptRef.sha256, hostReceiptSha256: hostRef.sha256,
    snapshots: receipt.days, controls: receipt.controls };
  const args = { directory, receipt: receiptRef, hostReceipt: hostRef, preflight: ref(write('preflight.json', preflight)) };
  return { args, records, controls, cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}

module.exports = { captureCoreFixture };
