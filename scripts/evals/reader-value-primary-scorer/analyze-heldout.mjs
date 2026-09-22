import { createHash } from 'node:crypto';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';

const [corpusPath, resultsPath, packetPath, safePath, selectionPath] = process.argv.slice(2);
if (!corpusPath || !resultsPath || !packetPath || !safePath || !selectionPath) {
  throw new Error('usage: analyze-heldout CORPUS RESULTS PRIVATE_PACKET SAFE_RESULTS PRIVATE_SELECTION');
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8'));
const records = readFileSync(resultsPath, 'utf8').trim().split('\n')
  .filter(Boolean).map((line) => JSON.parse(line));
const success = records.filter((record) => record.status === 'success');
const successfulCandidateIds = new Set();
for (const record of success) {
  if (successfulCandidateIds.has(record.candidateId)) {
    throw new Error(`duplicate successful heldout result for candidate ${record.candidateId}`);
  }
  successfulCandidateIds.add(record.candidateId);
}
validateSuccessfulResultProvenance(corpus, success);
const byCandidate = new Map(success.map((record) => [record.candidateId, record]));
if (corpus.days.length !== 5 || corpus.rowCount !== corpus.rows.length ||
    byCandidate.size !== corpus.rows.length || records.length !== success.length) {
  throw new Error('heldout corpus/results are incomplete');
}

const usefulnessRank = { insufficient_context: -1, noise: 0, context: 1, useful: 2, important: 3 };
const relevanceRank = { insufficient_context: -1, unrelated: 0, adjacent: 1, relevant: 2, central: 3 };
const providerFamily = (key) => {
  const value = key.trim().toLowerCase();
  if (['x', 'twitter', 'x-twitter'].includes(value)) return 'x';
  if (value === 'reddit') return 'reddit';
  if (['hn', 'hacker_news', 'hacker-news'].includes(value)) return 'hacker_news';
  if (value === 'rss') return 'rss';
  if (['github', 'github_radar', 'github-repo-radar', 'github-trending-page'].includes(value)) return 'github_radar';
  throw new Error(`unsupported provider ${key}`);
};
const compareUtf8 = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const timestampMicros = (value) => {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.(\d{3,6})Z$/u.exec(value);
  if (match === null) return undefined;
  const millis = Date.parse(`${match[1]}.${match[2].slice(0, 3)}Z`);
  if (!Number.isFinite(millis)) return undefined;
  return BigInt(millis) * 1_000n + BigInt(match[2].padEnd(6, '0').slice(3));
};
const compareTimestampDesc = (left, right) => {
  const leftMicros = timestampMicros(left);
  const rightMicros = timestampMicros(right);
  if (leftMicros === undefined || rightMicros === undefined) {
    throw new Error('heldout candidate has an invalid canonical publishedAt timestamp');
  }
  return leftMicros === rightMicros ? 0 : leftMicros > rightMicros ? -1 : 1;
};
const compare = (left, right) =>
  usefulnessRank[right.answers.usefulness.choice] - usefulnessRank[left.answers.usefulness.choice] ||
  relevanceRank[right.answers.relevance.choice] - relevanceRank[left.answers.relevance.choice] ||
  compareTimestampDesc(left.candidate.publishedAt, right.candidate.publishedAt) ||
  compareUtf8(left.candidate.candidateId, right.candidate.candidateId);
const storyKey = (row) => {
  try {
    const url = new URL(row.canonicalUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./u, '').replace(/^m\./u, '')
      .replace(/^old\./u, '').replace(/^mobile\./u, '').replace(/^twitter\.com$/u, 'x.com');
    if (host === 'news.ycombinator.com' && url.pathname.replace(/\/+$/u, '') === '/item') {
      return `url:${host}/item/${url.searchParams.get('id') ?? ''}`;
    }
    return `url:${host}${url.pathname.replace(/\/{2,}/gu, '/').replace(/\/+$/u, '').toLowerCase()}`;
  } catch {
    return `source:${row.providerKey}:${row.sourceItemId}`;
  }
};
const selectDay = (rows) => {
  const admitted = rows.map((candidate) => ({
    candidate,
    answers: byCandidate.get(candidate.candidateId).response.answers,
    family: providerFamily(candidate.providerKey),
  })).filter(({ candidate, answers }) => candidate.providerKey !== 'github-trending-page' &&
    ['useful', 'important'].includes(answers.usefulness.choice) &&
    ['relevant', 'central'].includes(answers.relevance.choice)).sort(compare);
  const representatives = [];
  const stories = new Set();
  const sources = new Set();
  for (const row of admitted) {
    const story = storyKey(row.candidate);
    if (stories.has(story) || sources.has(row.candidate.sourceItemId)) continue;
    stories.add(story); sources.add(row.candidate.sourceItemId); representatives.push(row);
  }
  const activeProviders = new Set(representatives.map((row) => row.family)).size;
  const cap = Math.min(8, activeProviders <= 1 ? 8 : activeProviders === 2 ? 6 : 4);
  const counts = new Map();
  const top = [];
  for (const row of representatives) {
    const count = counts.get(row.family) ?? 0;
    if (top.length < 8 && count < cap) {
      top.push(row); counts.set(row.family, count + 1);
    }
  }
  return { admitted, top, activeProviders, cap };
};

const daily = corpus.days.map((day) => {
  const dayRows = corpus.rows.filter((row) => row.day === day);
  const selected = selectDay(dayRows);
  const legacy = corpus.legacyTop.find((item) => item.day === day);
  return { day, inventory: dayRows.length, legacyStatus: legacy?.status ?? 'MISSING',
    legacyIds: (legacy?.selected ?? []).map((item) => item.candidateId),
    v3Ids: selected.top.map((item) => item.candidate.candidateId),
    admittedCount: selected.admitted.length, activeProviders: selected.activeProviders,
    providerCap: selected.cap };
});
const selectedIds = new Set(daily.flatMap((day) => [...day.legacyIds, ...day.v3Ids]));
const seed = 'reader-value-heldout-2026-09-13-17-excluded-v1';
const groups = new Map();
for (const row of corpus.rows) {
  if (selectedIds.has(row.candidateId)) continue;
  const key = `${row.day}|${row.providerKey}`;
  const group = groups.get(key) ?? [];
  group.push(row); groups.set(key, group);
}
for (const group of groups.values()) {
  group.sort((left, right) => compareUtf8(sha256(`${seed}|${left.candidateId}`),
    sha256(`${seed}|${right.candidateId}`)));
}
const excluded = [];
while (excluded.length < 100) {
  let changed = false;
  for (const key of [...groups.keys()].sort(compareUtf8)) {
    const row = groups.get(key).shift();
    if (row) { excluded.push(row); changed = true; if (excluded.length === 100) break; }
  }
  if (!changed) break;
}
const packetRows = [...new Map([
  ...daily.flatMap((day) => [...day.legacyIds, ...day.v3Ids]), ...excluded.map((row) => row.candidateId),
].map((id) => [id, corpus.rows.find((row) => row.candidateId === id)])).values()]
  .filter(Boolean).sort((left, right) => compareUtf8(sha256(`${seed}|packet|${left.candidateId}`),
    sha256(`${seed}|packet|${right.candidateId}`)))
  .map((row, index) => ({ packetId: `item-${String(index + 1).padStart(3, '0')}`,
    candidateId: row.candidateId, day: row.day, providerKey: row.providerKey,
    title: row.title, sourceText: row.body, textState: row.textState,
    modelInputTruncated: row.modelInputTruncated === true }));
const packet = { schemaVersion: 1, packetId: 'reader-value-heldout-blind-v1', seed,
  trustedInterest: corpus.interest.query, labels: {
    editorialValue: ['useful', 'borderline', 'noise', 'insufficient_data'],
    importance: ['important', 'not_important'],
  }, rowCount: packetRows.length, rows: packetRows };
packet.packetSha256 = sha256(JSON.stringify(packet));
writeFileSync(packetPath, `${JSON.stringify(packet, null, 2)}\n`, { mode: 0o600 });
chmodSync(packetPath, 0o600);
const privateSelection = { schemaVersion: 1, corpusDigest: corpus.corpusDigest,
  days: daily.map(({ day, legacyIds, v3Ids }) => ({ day, legacyIds, v3Ids })),
  labeledRows: packetRows.map(({ candidateId, day }) => ({ candidateId, day })) };
writeFileSync(selectionPath, `${JSON.stringify(privateSelection, null, 2)}\n`, { mode: 0o600 });
chmodSync(selectionPath, 0o600);

const latencies = success.map((item) => item.latencyMs).sort((a, b) => a - b);
const usage = success.map((item) => item.response.usage);
const knownCosts = usage.filter((item) => isKnownCost(item?.cost)).map((item) => item.cost);
const knownInputTokens = usage.filter((item) => isKnownInputTokens(item?.input_tokens))
  .map((item) => item.input_tokens);
const unknownCostCallCount = usage.length - knownCosts.length;
const unknownInputTokensCallCount = usage.length - knownInputTokens.length;
const unknownUsageCallCount = usage.filter((item) =>
  !isKnownCost(item?.cost) || !isKnownInputTokens(item?.input_tokens)).length;
const knownCostUsdSubtotal = knownCosts.reduce((sum, value) => sum + value, 0);
const knownInputTokensSubtotal = knownInputTokens.reduce((sum, value) => sum + value, 0);
const safe = { schemaVersion: 2, corpusId: corpus.corpusId, corpusDigest: corpus.corpusDigest,
  scorerCorpusDigest: corpus.scorerCorpusDigest, cutoffKind: corpus.cutoffKind,
  cutoffs: corpus.cutoffs, days: daily.map(({ legacyIds, v3Ids, ...item }) => ({
    ...item, legacySelected: legacyIds.length, v3ReviewerSelected: v3Ids.length,
    overlap: legacyIds.filter((id) => v3Ids.includes(id)).length,
  })), inventoryCount: corpus.rowCount, scoredCount: success.length,
  model: [...new Set(success.map((item) => item.response.model))],
  provider: [...new Set(success.map((item) => item.response.provider))],
  rubricVersion: [...new Set(success.map((item) => item.rubricVersion))],
  configSha256: [...new Set(success.map((item) => item.configSha256))],
  costUsd: unknownCostCallCount === 0 ? knownCostUsdSubtotal : null,
  inputTokens: unknownInputTokensCallCount === 0 ? knownInputTokensSubtotal : null,
  usageAccounting: { callCount: usage.length, knownCostCallCount: knownCosts.length,
    unknownCostCallCount, knownInputTokensCallCount: knownInputTokens.length,
    unknownInputTokensCallCount, unknownUsageCallCount,
    hasUnknownUsage: unknownUsageCallCount > 0,
    knownCostUsdSubtotal, knownInputTokensSubtotal },
  latencyMs: { p50: latencies[Math.floor(latencies.length * 0.5)],
    p95: latencies[Math.floor(latencies.length * 0.95)],
    mean: Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) },
  blindPacket: { rowCount: packetRows.length, excludedSampleCount: excluded.length,
    packetSha256: packet.packetSha256, seed },
  limitations: ['legacy Top is the persisted production selection, not a fresh V2 replay',
    'source text is a read-only export snapshot, not historical-at-publication text',
    'V3 reviewer-only selection does not measure presentation/headline losses'] };
safe.safeSha256 = sha256(JSON.stringify(safe));
writeFileSync(safePath, `${JSON.stringify(safe, null, 2)}\n`);

function isKnownCost(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isKnownInputTokens(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateSuccessfulResultProvenance(value, successfulResults) {
  const scoringConfig = value?.scoringConfig;
  if (scoringConfig === null || typeof scoringConfig !== 'object' ||
      typeof scoringConfig.rubricVersion !== 'string' || scoringConfig.rubricVersion.length === 0 ||
      typeof scoringConfig.configSha256 !== 'string' || scoringConfig.configSha256.length === 0) {
    throw new Error('heldout corpus scoring configuration provenance is incomplete');
  }

  const candidates = new Map();
  for (const row of Array.isArray(value?.rows) ? value.rows : []) {
    if (typeof row?.candidateId !== 'string' || typeof row.sourceSnapshotSha256 !== 'string' ||
        row.sourceSnapshotSha256.length === 0 || typeof row.requestSha256 !== 'string' ||
        row.requestSha256.length === 0) {
      throw new Error(`heldout corpus provenance is incomplete for candidate ${String(row?.candidateId)}`);
    }
    candidates.set(row.candidateId, row);
  }

  for (const result of successfulResults) {
    const expected = candidates.get(result.candidateId);
    if (expected === undefined) {
      throw new Error(`successful heldout result has unknown candidate ${String(result.candidateId)}`);
    }
    for (const [field, expectedValue] of [
      ['sourceSnapshotSha256', expected.sourceSnapshotSha256],
      ['requestSha256', expected.requestSha256],
      ['rubricVersion', scoringConfig.rubricVersion],
      ['configSha256', scoringConfig.configSha256],
    ]) {
      if (result[field] !== expectedValue) {
        throw new Error(`heldout result provenance mismatch for candidate ${result.candidateId}: ${field}`);
      }
    }
  }
}
