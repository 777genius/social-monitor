import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [selectionPath, scorerSafePath, labelsAPath, labelsBPath, outputPath, technicalFixturesPath] =
  process.argv.slice(2);
if (!selectionPath || !scorerSafePath || !labelsAPath || !labelsBPath || !outputPath) {
  throw new Error('usage: evaluate-heldout-labels PRIVATE_SELECTION SCORER_SAFE LABELS_A LABELS_B OUTPUT [TECHNICAL_FIXTURES]');
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const selection = JSON.parse(readFileSync(selectionPath, 'utf8'));
const scorer = JSON.parse(readFileSync(scorerSafePath, 'utf8'));
const technicalEvidence = technicalFixturesPath === undefined ? null :
  JSON.parse(readFileSync(technicalFixturesPath, 'utf8'));
const labelFiles = [labelsAPath, labelsBPath].map((path) =>
  JSON.parse(readFileSync(path, 'utf8')));
const labelItems = labelFiles.flatMap((file) => file.items);
const labels = new Map(labelItems.map((item) => [item.candidateId, item]));
if (labels.size !== labelItems.length) throw new Error('duplicate candidate identity in blind labels');
if (labels.size !== scorer.blindPacket.rowCount) throw new Error('incomplete blind labels');
for (const label of labels.values()) {
  if (!['useful', 'borderline', 'noise', 'insufficient_data'].includes(label.editorialValue) ||
      !['important', 'not_important'].includes(label.importance) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(label.storyKey)) {
    throw new Error('invalid blind label');
  }
}

validateSelectionProtocol(selection, scorer, labels);
const selectedByDay = new Map(selection.days.map((item) => [item.day, {
  legacy_v2: item.legacyIds, jev_reviewer_v3: item.v3Ids,
}]));

const evaluate = (ids) => {
  const judged = ids.map((id) => labels.get(id));
  if (judged.some((item) => item === undefined)) throw new Error('selected item is unlabeled');
  const uniqueUseful = new Set(judged.filter((item) => item.editorialValue === 'useful')
    .map((item) => item.storyKey));
  const uniqueAll = new Set(judged.map((item) => item.storyKey));
  return { selected: ids.length, evaluated: judged.length, usefulUniqueStories: uniqueUseful.size,
    usefulItems: judged.filter((item) => item.editorialValue === 'useful').length,
    importantUsefulItems: judged.filter((item) => item.editorialValue === 'useful' &&
      item.importance === 'important').length,
    borderline: judged.filter((item) => item.editorialValue === 'borderline').length,
    noise: judged.filter((item) => item.editorialValue === 'noise').length,
    insufficientData: judged.filter((item) => item.editorialValue === 'insufficient_data').length,
    duplicateItems: ids.length - uniqueAll.size };
};
const missedUseful = (day, selectedIds) => {
  const selected = new Set(selectedIds);
  const missed = selection.labeledRows.filter((row) => row.day === day &&
    !selected.has(row.candidateId)).map((row) => labels.get(row.candidateId))
    .filter((item) => item.editorialValue === 'useful');
  return { items: missed.length, uniqueStories: new Set(missed.map((item) => item.storyKey)).size };
};
const daily = selection.days.map(({ day }) => {
  const selected = selectedByDay.get(day);
  return { day,
    legacy_v2: { ...evaluate(selected.legacy_v2),
      labeledUsefulMisses: missedUseful(day, selected.legacy_v2) },
    jev_reviewer_v3: { ...evaluate(selected.jev_reviewer_v3),
      labeledUsefulMisses: missedUseful(day, selected.jev_reviewer_v3) } };
});
const total = (variant) => {
  const values = daily.map((day) => day[variant]);
  const sum = (field) => values.reduce((result, item) => result + item[field], 0);
  const selected = sum('selected');
  return { availableTopSlots: 40, selected, evaluated: sum('evaluated'), emptyTopSlots: 40 - selected,
    usefulUniqueStoriesAt8: sum('usefulUniqueStories'), usefulItems: sum('usefulItems'),
    importantUsefulItems: sum('importantUsefulItems'), borderline: sum('borderline'),
    noise: sum('noise'), insufficientData: sum('insufficientData'),
    duplicateItems: sum('duplicateItems'), noiseFraction: selected === 0 ? null : sum('noise') / selected,
    labeledUsefulMisses: {
      items: values.reduce((result, item) => result + item.labeledUsefulMisses.items, 0),
      uniqueStories: values.reduce((result, item) =>
        result + item.labeledUsefulMisses.uniqueStories, 0),
    } };
};
const legacy = total('legacy_v2');
const jev = total('jev_reviewer_v3');
const knownImportantControlStoryKeys = uniqueStrings(selection.knownImportantControlStoryKeys);
const requiredTechnicalFixtureIds = uniqueStrings(selection.requiredTechnicalFixtureIds);
const jevSelectedStoryKeys = new Set(selection.days.flatMap(({ day }) =>
  selectedByDay.get(day).jev_reviewer_v3.map((id) => labels.get(id).storyKey)));
const missingKnownImportantControls = knownImportantControlStoryKeys.filter((key) =>
  !jevSelectedStoryKeys.has(key));
const fixtureResults = technicalEvidence !== null &&
  technicalEvidence.schemaVersion === 'reader-value-primary-scorer-technical-fixtures.v1' &&
  Array.isArray(technicalEvidence.fixtures) ? technicalEvidence.fixtures : [];
const passedTechnicalFixtureIds = new Set(fixtureResults.filter((fixture) =>
  fixture !== null && typeof fixture === 'object' && typeof fixture.id === 'string' &&
  fixture.passed === true).map((fixture) => fixture.id));
const missingTechnicalFixtures = requiredTechnicalFixtureIds.filter((id) => !passedTechnicalFixtureIds.has(id));
const comparableSelections = legacy.selected > 0 && jev.selected > 0 &&
  legacy.evaluated === legacy.selected && jev.evaluated === jev.selected;
const comparableNoise = Number.isFinite(legacy.noiseFraction) && Number.isFinite(jev.noiseFraction);
const controlsPreserved = knownImportantControlStoryKeys.length > 0 &&
  missingKnownImportantControls.length === 0;
const technicalFixturesPassed = requiredTechnicalFixtureIds.length > 0 &&
  missingTechnicalFixtures.length === 0;
const usageAccounting = validateUsageAccounting(scorer);
const output = { schemaVersion: 3, evaluationId: 'reader-value-heldout-quality-v3',
  corpusDigest: scorer.corpusDigest, scorerCorpusDigest: scorer.scorerCorpusDigest,
  packetSha256: scorer.blindPacket.packetSha256, labelPacketCount: labels.size,
  judge: labelFiles.map((file) => file.judge), daily, totals: {
    legacy_v2: legacy, jev_reviewer_v3: jev },
  controls: {
    knownImportant: { expectedStoryKeys: knownImportantControlStoryKeys,
      missingStoryKeys: missingKnownImportantControls, preserved: controlsPreserved },
    technicalFixtures: { evidenceProvided: technicalEvidence !== null,
      requiredIds: requiredTechnicalFixtureIds, missingOrFailedIds: missingTechnicalFixtures,
      passed: technicalFixturesPassed },
    usageAccounting,
  },
  verdict: comparableSelections && comparableNoise && controlsPreserved && technicalFixturesPassed &&
    usageAccounting.complete &&
    jev.usefulUniqueStoriesAt8 > legacy.usefulUniqueStoriesAt8 &&
    jev.noiseFraction <= legacy.noiseFraction ? 'reviewer_only_quality_pass' : 'quality_not_proven',
  productReady: false,
  productReadyReason: 'display-ready presentation losses and exact reader-value.v1 rubric were not measured',
  limitations: scorer.limitations };
output.evaluationSha256 = sha256(JSON.stringify(output));
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);

function uniqueStrings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) return [];
  return [...new Set(value)];
}

function validateSelectionProtocol(value, safeScorer, blindLabels) {
  const diagnostics = [];
  if (value.corpusDigest !== safeScorer.corpusDigest) diagnostics.push('corpus digest does not match');
  if (!Array.isArray(value.days) || value.days.length !== 5) {
    diagnostics.push('selection must contain exactly five UTC day windows');
  }
  const days = Array.isArray(value.days) ? value.days : [];
  const ordinals = days.map((item, index) => utcDayOrdinal(item?.day, index, diagnostics));
  for (let index = 1; index < ordinals.length; index += 1) {
    if (ordinals[index - 1] === undefined || ordinals[index] === undefined) continue;
    if (ordinals[index] !== ordinals[index - 1] + 1) {
      diagnostics.push(`day windows are not distinct and consecutive at index ${index}`);
    }
  }
  const daySet = new Set(days.map((item) => item?.day));
  if (daySet.size !== days.length) diagnostics.push('day windows contain a duplicate day');
  if (!Array.isArray(safeScorer.days) || safeScorer.days.length !== days.length ||
      safeScorer.days.some((item, index) => item?.day !== days[index]?.day)) {
    diagnostics.push('selection day windows do not match scorer day windows');
  }

  if (!Array.isArray(value.labeledRows)) diagnostics.push('labeledRows must be an array');
  const candidateDays = new Map();
  for (const [index, row] of (Array.isArray(value.labeledRows) ? value.labeledRows : []).entries()) {
    if (typeof row?.candidateId !== 'string' || row.candidateId.length === 0) {
      diagnostics.push(`labeledRows[${index}] has an invalid candidate identity`);
      continue;
    }
    if (candidateDays.has(row.candidateId)) {
      diagnostics.push(`labeledRows[${index}] duplicates a candidate identity`);
    } else {
      candidateDays.set(row.candidateId, row.day);
    }
    if (!daySet.has(row.day)) diagnostics.push(`labeledRows[${index}] has an unknown day window`);
    if (!blindLabels.has(row.candidateId)) diagnostics.push(`labeledRows[${index}] has no blind label`);
  }
  if (candidateDays.size !== blindLabels.size) {
    diagnostics.push('labeled candidate identities do not exactly match blind labels');
  }

  for (const [dayIndex, item] of days.entries()) {
    for (const [field, variant] of [['legacyIds', 'legacy_v2'], ['v3Ids', 'jev_reviewer_v3']]) {
      const ids = item?.[field];
      if (!Array.isArray(ids)) {
        diagnostics.push(`${variant} selections for day index ${dayIndex} must be an array`);
        continue;
      }
      if (ids.length > 8) diagnostics.push(`${variant} has ${ids.length} selections on ${item.day}; maximum is 8`);
      if (ids.some((id) => typeof id !== 'string' || id.length === 0)) {
        diagnostics.push(`${variant} has an invalid candidate identity on ${item.day}`);
      }
      if (new Set(ids).size !== ids.length) {
        diagnostics.push(`${variant} has a duplicate candidate identity on ${item.day}`);
      }
      for (const [idIndex, id] of ids.entries()) {
        if (candidateDays.get(id) !== item.day) {
          diagnostics.push(`${variant} selection index ${idIndex} is not labeled for ${item.day}`);
        }
      }
    }
  }
  if (diagnostics.length > 0) throw new Error(`invalid heldout selection protocol: ${diagnostics.join('; ')}`);
}

function utcDayOrdinal(value, index, diagnostics) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    diagnostics.push(`day window at index ${index} is not YYYY-MM-DD`);
    return undefined;
  }
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) {
    diagnostics.push(`day window ${value} is not a valid UTC date`);
    return undefined;
  }
  return milliseconds / 86_400_000;
}

function validateUsageAccounting(safeScorer) {
  const value = safeScorer.usageAccounting;
  const diagnostics = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { complete: false, hasUnknownUsage: true, unknownUsageCallCount: null,
      diagnostics: ['scorer usage accounting is missing'] };
  }
  const countFields = ['callCount', 'knownCostCallCount', 'unknownCostCallCount',
    'knownInputTokensCallCount', 'unknownInputTokensCallCount', 'unknownUsageCallCount'];
  if (countFields.some((field) => !Number.isSafeInteger(value[field]) || value[field] < 0)) {
    diagnostics.push('usage accounting counts are invalid');
  }
  if (!Number.isSafeInteger(safeScorer.scoredCount) || safeScorer.scoredCount < 0 ||
      value.callCount !== safeScorer.scoredCount) {
    diagnostics.push('usage accounting call count does not match scored count');
  }
  if (value.knownCostCallCount + value.unknownCostCallCount !== value.callCount ||
      value.knownInputTokensCallCount + value.unknownInputTokensCallCount !== value.callCount) {
    diagnostics.push('usage accounting subtotals do not match call count');
  }
  if (typeof value.hasUnknownUsage !== 'boolean' ||
      value.hasUnknownUsage !== (value.unknownUsageCallCount > 0)) {
    diagnostics.push('usage unknown flag does not match unknown call count');
  }
  if (value.unknownUsageCallCount < Math.max(value.unknownCostCallCount,
    value.unknownInputTokensCallCount) || value.unknownUsageCallCount >
      value.unknownCostCallCount + value.unknownInputTokensCallCount) {
    diagnostics.push('usage unknown call count is inconsistent with metric counts');
  }
  if (typeof value.knownCostUsdSubtotal !== 'number' ||
      !Number.isFinite(value.knownCostUsdSubtotal) || value.knownCostUsdSubtotal < 0 ||
      !Number.isSafeInteger(value.knownInputTokensSubtotal) || value.knownInputTokensSubtotal < 0) {
    diagnostics.push('usage known subtotals are invalid');
  }
  if (value.unknownCostCallCount === 0 && safeScorer.costUsd !== value.knownCostUsdSubtotal) {
    diagnostics.push('complete cost total does not match known subtotal');
  }
  if (value.unknownInputTokensCallCount === 0 &&
      safeScorer.inputTokens !== value.knownInputTokensSubtotal) {
    diagnostics.push('complete input-token total does not match known subtotal');
  }
  const complete = diagnostics.length === 0 && value.hasUnknownUsage === false &&
    value.unknownCostCallCount === 0 && value.unknownInputTokensCallCount === 0;
  return { complete, hasUnknownUsage: value.hasUnknownUsage === true,
    unknownUsageCallCount: Number.isSafeInteger(value.unknownUsageCallCount) ?
      value.unknownUsageCallCount : null, diagnostics };
}
