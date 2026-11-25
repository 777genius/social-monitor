'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { read, snapshot, date } = require('./frozen-input.cjs');
const { check, sha, digest } = require('./revision-source.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
function canonical(value) {
  if (require('node:util').types.isDate(value)) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value === undefined ? { $undefined: true } : value;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function withKeys(value, keys) {
  check(Array.isArray(keys) && new Set(keys).size === keys.length && keys.every(k => typeof k === 'string'), 'invalid_present_keys');
  check(Object.keys(value).every(k => keys.includes(k)), 'unlisted_present_key');
  return Object.fromEntries(keys.map(k => [k, value[k]]));
}
function ledger() {
  const gaps = new Map();
  return { add(kind, request = null) {
    const gap = { kind, request: canonical(request), requestSha256: digest(canonical(request)) };
    gaps.set(`${kind}:${gap.requestSha256}`, gap); return gap;
  }, fail(kind, request) { this.add(kind, request); throw Error(kind); },
  entries: () => [...gaps.values()], missing: () => [...gaps.values()].filter(g => g.kind.startsWith('missing_')).length };
}
function capture(ref) {
  const seal = read(ref), directory = path.dirname(ref.path);
  check(seal.format === 'reader-refresh-paired-capture.v1' && Array.isArray(seal.files), 'unsupported_capture');
  const files = {}, hashes = {};
  let bytesUsed = 0;
  for (const file of seal.files) {
    check(/^[a-z][a-z-]*\.(json|jsonl)$/.test(file.name) && !Object.hasOwn(files, file.name), 'invalid_capture_filename');
    const filename = path.join(directory, file.name), stat = fs.lstatSync(filename);
    check(stat.isFile() && stat.size === file.bytes && (bytesUsed += stat.size) <= 128 * 1024 * 1024, 'capture_size_or_type');
    const bytes = fs.readFileSync(filename); check(sha(bytes) === file.sha256, `capture_hash_mismatch:${file.name}`);
    files[file.name] = file.name.endsWith('.jsonl') ? bytes.toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : JSON.parse(bytes);
    hashes[file.name] = file.sha256;
  }
  for (const name of ['started.json', 'inputs.json', 'snapshot-query.json', 'selection-query.json', 'controls.json']) check(files[name], `missing_capture_file:${name}`);
  const events = Object.entries(files).filter(([name]) => name.endsWith('.jsonl')).flatMap(([, rows]) => rows);
  check(events.length <= 4096, 'capture_event_cap');
  check(new Set(events.map(e => e.sequence)).size === events.length && events.every(e => Number.isSafeInteger(e.sequence) && e.sequence > 0 && Number.isSafeInteger(e.atMs)), 'invalid_journal_sequence');
  return { seal, files, hashes, sealSha256: ref.sha256 };
}
function ports(source, tape, gaps, evaluation) {
  const observation = evaluation?.observation;
  const inputs = observation ? { snapshot: observation.snapshot, query: observation.observationQuery,
    queryKeys: observation.observationPresentKeys,
    primaryIds: observation.snapshot.candidates.map(c => c.item.id),
    supplementalIds: (observation.snapshot.supplementalItems || []).map(i => i.id) } : tape.files['inputs.json'];
  const raw = inputs.snapshot;
  const recorded = observation ? { query: observation.observationQuery, presentKeys: observation.observationPresentKeys } : tape.files['snapshot-query.json'];
  check(same(inputs.query, recorded.query) && same(inputs.queryKeys, recorded.presentKeys), 'capture_query_disagreement');
  const q = recorded.query;
  const expected = evaluation?.controls.snapshot ?? recorded;
  const evaluationCutoff = evaluation?.evaluationClock ?? q.observedThrough;
  check(q.timestampPolicy === 'published_at', 'unsupported_snapshot_timestamp_policy');
  const day = q.windowStartedAt.slice(0, 10);
  check(date(q.windowEndedAt).getTime() - date(q.windowStartedAt).getTime() === 86400000 && q.windowStartedAt === `${day}T00:00:00.000Z`, 'snapshot_not_one_UTC_day');
  const primaryIds = raw.candidates.map(c => c.item.id), supplementalIds = (raw.supplementalItems || []).map(i => i.id);
  check(same(primaryIds, inputs.primaryIds) && same(supplementalIds, inputs.supplementalIds), 'raw_partition_inventory_disagreement');
  const wrapped = { ...raw, candidates: raw.candidates.map(c => ({ ...c, item: { props: c.item } })),
    supplementalItems: raw.supplementalItems?.map(props => ({ props })) };
  const FeedItem = source.load('libs/feed/domain/entities/feed-item.ts').FeedItem;
  const hydrate = () => snapshot({ format: 'read-only-full-promotion-snapshot.v1', capturedAt: observation?.endedAt ?? q.observedThrough,
    observedThrough: q.observedThrough, snapshot: clone(wrapped) }, day,
  { tenantId: q.tenantId, workspaceId: q.workspaceId, clock: q.observedThrough, query: q }, FeedItem);
  hydrate(); // Validate before any selector catches a port exception.
  const calls = [];
  const deny = name => new Proxy({}, { get: (_target, key) => (...args) => gaps.fail('unexpected_port_call', { name, method: String(key), args }) });
  const feed = new Proxy({}, { get: (_target, key) => {
    if (key !== 'readPromotionSnapshot') return deny('feed')[key];
    return async query => {
      calls.push({ port: 'snapshot', query: canonical(query) });
      if (!same(query, withKeys(expected.query, expected.presentKeys))) gaps.fail('snapshot_query_mismatch', query);
      return hydrate();
    };
  } });
  const interestRecords = evaluation?.controls.interests ?? (tape.files['interests.jsonl'] || []).map(row => row.event);
  const interests = { readCurrent: async query => {
    calls.push({ port: 'interest', query: canonical(query) });
    const matches = interestRecords.filter(r => same(r.query, query));
    if (matches.length !== 1) gaps.fail('missing_interest_request', query);
    const result = matches[0].result;
    if (result.kind === 'available') {
      const interest = result.interest;
      if (!interest.query?.trim() || ['tenantId', 'workspaceId', 'interestId'].some(k => interest[k] !== query[k])) gaps.fail('interest_scope_mismatch', query);
    }
    return clone(result);
  } };
  return { feed, interests, deny, calls, primaryIds, supplementalIds, day, raw,
    clock: { now: () => date(evaluationCutoff) }, cutoff: evaluationCutoff };
}
module.exports = { capture, ports, ledger, clone, canonical, same, withKeys };
