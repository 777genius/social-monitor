'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { OLD, FINAL, revisionSource } = require('./revision-source.cjs');
const { DAYS, read, sha, digest, check, controls, snapshot, bundle } = require('./frozen-input.cjs');
const { select, compare } = require('./revision-selection.cjs');
const VOLUME = '/mnt/volume_ams3_1784742570542/social-monitor-e2e-workers';
const SEP = { original: '/var/data/social-monitor/runtime/sm-sep02-refresh-20260908/full-snapshot.json',
  current: '/var/data/social-monitor/runtime/sep02-x-90ed-20260909.m6YERE/full-snapshot-after-x.json' };
const SEP_HASH = { original: '2ab8612ea1a7e638da54f9a7cbbc592380c8c3b0b3ff15835e1cd0fab593592e', current: '147472fb69b4471cfea9dffc1598b6608c7456f911294032c20fcdd2a012c265' };
const CURRENT_HASH = {
  '2026-08-30': 'af400770a7095314fe2fc44ede4442ba371123f800ca5b876a9e776250c22522',
  '2026-08-31': '22a74d776ec6042628a446e1fca54b64398bb0fe425095a37eb8b35a87ffb23e',
  '2026-09-01': '869bcb909b268b9d23e539fad5d22a4aa33bd960c48fd4bfc1121bff8ea9f112',
  '2026-09-02': SEP_HASH.current,
  '2026-09-03': 'd7e2d706af21726152cb4090f63a0a11ae049ee784b85973b0d7fda23ce1ca9e',
  '2026-09-04': 'c0aa1a3961d4eed2b11c7a4c880a4162a362935d02c41a566a1fbc1fc6b7e8f2',
  '2026-09-05': '2b2cb6e875b26e0574497a9415d922b9aa575a05a93c3d512e685d95e6f16d9b',
};
function inventory() {
  const gaps = [], days = [];
  for (const day of DAYS) {
    const row = { day, controls: null, original: { snapshot: null, projection: null }, current: { snapshot: null, projection: null } };
    for (const arm of ['original', 'current']) {
      const filename = day === '2026-09-02' ? SEP[arm] : arm === 'current' ? `${VOLUME}/six-day-snapshot-prep-20260909/${day}.json` : null;
      if (filename) try {
        const bytes = fs.readFileSync(filename), raw = JSON.parse(bytes);
        check(sha(bytes) === (arm === 'current' ? CURRENT_HASH[day] : SEP_HASH.original), 'raw pin mismatch');
        check(raw.format === 'read-only-full-promotion-snapshot.v1' && raw.snapshot?.ok && raw.snapshot.exhausted &&
          raw.snapshot.candidates.every(x => x.item.props.publishedAt.slice(0, 10) === day), 'incomplete/mismatched raw day');
        row[arm].snapshot = { path: filename, sha256: sha(bytes) };
        row[arm].rawInventory = { candidates: raw.snapshot.candidates.length, supplemental: raw.snapshot.supplementalItems?.length ?? 0,
          observedThrough: raw.observedThrough, capturedAt: raw.capturedAt };
      } catch (e) { gaps.push({ day, arm, kind: 'raw_snapshot_unavailable_or_invalid', code: e.code ?? e.message }); }
      else gaps.push({ day, arm, kind: 'original_full_snapshot_missing' });
      gaps.push({ day, arm, kind: 'recorded_assessments_requests_headlines_grouping_projection_missing',
        missingPrimaryAssessments: row[arm].rawInventory?.candidates ?? null });
    }
    gaps.push({ day, kind: 'frozen_config_query_scope_common_clock_manifest_missing' }); days.push(row);
  }
  return { format: 'paired-experiment-inventory.v1', complete: false, gaps,
    requiredFullAlgorithmExperiment: 'pending: revision-local full selectors and recorded request-union/deadline outcomes',
    originalMeaning: 'Sep2 is the supplied Sep8 capture, not publication-time input; other six originals missing',
    pendingManifest: { format: 'paired-policy-matrix.v1', days } };
}
function execute(manifest, repo) {
  check(manifest.format === 'paired-policy-matrix.v1' && digest(manifest.days.map(d => d.day)) === digest(DAYS), 'exact ordered seven UTC days required');
  const result = { format: 'paired-policy-results.v1', complete: false,
    label: 'conditional selection-policy boundary; caller assertions pending producer contract',
    fullAlgorithmExperiment: { status: 'required_not_executed', missing: ['record-backed full-selector adapter', 'union request coverage', 'recorded deadline outcomes'] },
    algorithm: [], data: [], gaps: [] };
  for (const d of manifest.days) {
    try { controls(d.day, d.controls); } catch (e) { result.gaps.push({ day: d.day, kind: e.message }); continue; }
    const arms = {};
    for (const [label, revision, ref] of [['oldCurrent', OLD, d.current], ['finalCurrent', FINAL, d.current], ['finalOriginal', FINAL, d.original]]) {
      try {
        check(ref?.snapshot && ref?.projection, 'missing raw snapshot or complete recorded projection');
        if (label !== 'finalOriginal') check(ref.snapshot.sha256 === CURRENT_HASH[d.day], 'current raw pin mismatch');
        else if (d.day === '2026-09-02') check(ref.snapshot.sha256 === SEP_HASH.original, 'Sep2 original raw pin mismatch');
        const raw = read(ref.snapshot), source = revisionSource(repo, revision, d.controls.clock);
        const FeedItem = source.load('libs/feed/domain/entities/feed-item.ts').FeedItem;
        const hydrated = snapshot(raw, d.day, d.controls, FeedItem);
        const b = bundle(ref.projection, ref.snapshot, raw, d.controls, repo);
        arms[label] = { ...select(source, revision, b), snapshotSha256: ref.snapshot.sha256,
          projectionSha256: ref.projection.sha256, normalizedRawSha256: digest({ ...hydrated,
            candidates: hydrated.candidates.map(x => ({ ...x, item: x.item.toSnapshot() })), supplementalItems: hydrated.supplementalItems.map(x => x.toSnapshot()) }),
          controlsSha256: digest(d.controls), clock: d.controls.clock, observedThrough: raw.observedThrough };
      } catch (e) { result.gaps.push({ day: d.day, arm: label, kind: e.code ?? e.message,
        pendingIds: e.pendingIds ?? null, missingAssessmentCount: e.missingAssessmentCount ?? null }); }
    }
    if (arms.oldCurrent && arms.finalCurrent) result.algorithm.push({ day: d.day, before: arms.oldCurrent, after: arms.finalCurrent, changes: compare(arms.oldCurrent, arms.finalCurrent) });
    if (arms.finalOriginal && arms.finalCurrent) result.data.push({ day: d.day, before: arms.finalOriginal, after: arms.finalCurrent, changes: compare(arms.finalOriginal, arms.finalCurrent) });
  }
  result.manifestSha256 = digest(manifest);
  // No producer-owned offline assessment/grouping contract is implemented.
  result.conditionalPolicyComplete = false;
  return result;
}
async function main(args) {
  const options = {}; for (let i = 0; i < args.length; i += 2) {
    check(['--mode', '--manifest', '--sha256', '--out', '--repo'].includes(args[i]) && args[i + 1] && !options[args[i]], 'invalid CLI'); options[args[i]] = args[i + 1];
  }
  check(options['--out'], '--out required'); let result;
  try {
    check(['inventory', 'policy', 'full-selector'].includes(options['--mode']), 'unknown mode');
    result = options['--mode'] === 'full-selector'
      ? await require('./full-selector-matrix.cjs').executeFull(read({ path: options['--manifest'], sha256: options['--sha256'] }), options['--repo'] || process.cwd())
      : options['--mode'] === 'inventory' ? inventory() : execute(read({ path: options['--manifest'], sha256: options['--sha256'] }), options['--repo'] || process.cwd());
  } catch (e) { result = { complete: false, conditionalPolicyComplete: false, gaps: [{ kind: e.code ?? e.message }] }; }
  if (['policy', 'full-selector'].includes(options['--mode'])) result.manifestFileSha256 = options['--sha256'] ?? null;
  const out = path.resolve(options['--out']); check(out.startsWith('/tmp/'), 'outputs must be under /tmp');
  fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  process.exitCode = result.conditionalPolicyComplete ? 0 : 2;
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
module.exports = { inventory, execute, main };
