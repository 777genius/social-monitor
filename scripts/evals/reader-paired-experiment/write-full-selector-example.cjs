'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('./revision-source.cjs');
const { DAYS } = require('./frozen-input.cjs');
const { executeFull } = require('./full-selector-matrix.cjs');
const { syntheticTape, writeTape, modelControls } = require('./full-selector-fixture.cjs');
// Synthetic callback data only. No producer/model/capture execution. This writes
// two visibly synthetic populations and runs the three actual algorithm arms.
async function main(directory) {
  const out = path.resolve(directory);
  if (!out.startsWith('/tmp/')) throw Error('example_output_must_be_under_tmp');
  fs.mkdirSync(out, { mode: 0o700 });
  const original = syntheticTape(), input = original.files['inputs.json'];
  const removed = new Set(input.supplementalIds.slice(-3));
  input.supplementalIds = input.supplementalIds.slice(0, -3);
  input.snapshot.supplementalItems = input.snapshot.supplementalItems.slice(0, -3);
  input.snapshot.sourceContent = input.snapshot.sourceContent.filter(s => !removed.has(s.feedItemId));
  const currentRef = writeTape(path.join(out, 'synthetic-current'));
  const originalRef = writeTape(path.join(out, 'synthetic-original'), original);
  const manifest = { format: 'paired-full-selector-matrix.v1', synthetic: true, days: DAYS.map(day =>
    day === '2026-09-03' ? { day, current: { capture: currentRef }, original: { capture: originalRef }, modelControls } : { day }) };
  const result = await executeFull(manifest);
  const summary = { synthetic: true, complete: false, populatedDay: '2026-09-03',
    resultSha256: digest(result), originalCandidateCount: 13, currentCandidateCount: 16,
    missingOtherDays: 6, algorithm: result.algorithm.find(p => p.day === '2026-09-03'),
    data: result.data.find(p => p.day === '2026-09-03') };
  for (const [name, value] of Object.entries({ manifest, result, summary })) {
    fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  return summary;
}
if (require.main === module) main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 2; });
module.exports = { main };
