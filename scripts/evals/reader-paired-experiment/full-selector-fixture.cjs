'use strict';
// Machine-copied P2 SYNTHETIC callback data, retaining complete input partitions
// and response tapes. Large preparation/selection projections are intentionally
// absent: the regression must compute them. This is never an original capture.
const fs = require('node:fs');
const path = require('node:path');
const { sha } = require('./revision-source.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const fixture = require('./fixtures/p2-synthetic-capture.json');
const modelControls = { assessment: { batchTimeoutMs: 300000, totalTimeoutMs: 600000 }, relation: {} };
function syntheticTape() {
  return { files: clone(fixture), hashes: {}, sealSha256: sha(JSON.stringify(fixture)),
    seal: { format: 'reader-refresh-paired-capture.v1', complete: false,
      scope: clone(fixture['started.json'].scope), synthetic: true } };
}
function writeTape(directory, tape = syntheticTape()) {
  fs.mkdirSync(directory, { mode: 0o700 });
  const files = [];
  for (const [name, value] of Object.entries(tape.files)) {
    const bytes = name.endsWith('.jsonl') ? value.map(row => JSON.stringify(row)).join('\n') + '\n' : JSON.stringify(value) + '\n';
    fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx', mode: 0o600 });
    files.push({ name, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) });
  }
  const bytes = JSON.stringify({ ...tape.seal, files, complete: false, synthetic: true,
    experimentComplete: false, actualReplayVerified: false });
  const filename = path.join(directory, 'incomplete.json');
  fs.writeFileSync(filename, bytes, { flag: 'wx', mode: 0o600 });
  return { path: filename, sha256: sha(bytes) };
}
module.exports = { syntheticTape, writeTape, modelControls };
