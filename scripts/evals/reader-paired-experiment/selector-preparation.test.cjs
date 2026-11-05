'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { FINAL, OLD, digest } = require('./revision-source.cjs');
const { clone, canonical, ledger } = require('./recorded-selector-ports.cjs');
const { fullSelector } = require('./revision-full-selector.cjs');
const { auditPreparation, detach } = require('./selector-preparation-trace.cjs');
const { syntheticTape, modelControls } = require('./full-selector-fixture.cjs');
const expected = require('./fixtures/p2-preparation-hashes.json');
let result, tape;
test('actual pinned calls reproduce every retained P2 promotion/preparation/selection field hash', async () => {
  tape = syntheticTape(); result = await fullSelector({ tape, revision: FINAL, modelControls });
  assert.equal(result.selectorReturned, true);
  assert.equal(result.preparation.status, 'derived_from_actual_revision_calls');
  for (const [file, actual] of [['promotion.json', result.preparation.promotion], ['preparation.json', result.preparation.preparation], ['selection.json', result.selection]]) {
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected[file]).sort(), file);
    for (const [key, hash] of Object.entries(expected[file])) assert.equal(digest(canonical(actual[key])), hash, `${file}:${key}`);
  }
  const p = result.preparation.preparation;
  assert.equal(p.rankedInventory.length, 16); assert.equal(p.defaultProviderExcludedIds.length, 12);
  assert.equal(p.candidateItems.length, 16); assert.equal(p.groupingInput.length, 4);
  assert.equal(p.admittedSupplemental.length, 10);
  assert.deepEqual(p.verifiedPairs, []); assert.deepEqual(p.strictTitlePairs, []);
  assert.equal(result.preparation.promotion.supplemental.length, 12);
  assert.equal(result.replay.replayMissingRequestCount, 0); // Missing capture files are not missing requests.
});
test('self-hashed empty clusters, omitted identities, changed source and forged stage membership fail equality', () => {
  const complete = clone(tape);
  complete.files['promotion.json'] = result.preparation.promotion;
  complete.files['preparation.json'] = result.preparation.preparation;
  complete.files['selection.json'] = result.selection;
  const valid = auditPreparation(complete, result.preparation, result.selection, FINAL, ledger());
  assert.equal(valid.status, 'content_equal_origin_unverified');
  for (const mutate of [
    t => { t.files['preparation.json'].initialGrouping.clusters = []; },
    t => { t.files['promotion.json'].supplemental.pop(); },
    t => { t.files['promotion.json'].ranked.primary[0].sourceText += ' changed source'; },
    t => { t.files['preparation.json'].defaultProviderExcludedIds = []; },
    t => { t.files['preparation.json'].strictTitlePairs = ['forged-pair']; },
    t => { delete t.files['selection.json'].clusters; },
  ]) {
    const changed = clone(complete); mutate(changed); changed.sealSha256 = digest(changed.files);
    const gaps = ledger(), audit = auditPreparation(changed, result.preparation, result.selection, FINAL, gaps);
    assert.equal(audit.status, 'incomplete_or_mismatched');
    assert.ok(gaps.entries().some(g => g.kind === 'producer_preparation_mismatch'));
  }
});
test('OLD retains its actual multiple policy stages without interpreting them as FINAL capture preparation', async () => {
  const old = await fullSelector({ tape: syntheticTape(), revision: OLD, modelControls });
  assert.equal(old.selectorReturned, true);
  assert.equal(old.preparation.preparation, null);
  assert.equal(old.preparationAudit.status, 'not_applicable_to_OLD');
  assert.ok(old.preparationStages.filter(s => s.kind === 'promotion_policy').length > 1);
  assert.equal(old.assessmentRequests.length, 0);
});
test('trace detachment retains actual Set/Map members and nested Dates', () => {
  const value = detach({ pairs: new Set(['a:b']), map: new Map([['scope', new Date('2026-09-03T00:00:00.000Z')]]) });
  assert.deepEqual(value, { pairs: ['a:b'], map: [['scope', '2026-09-03T00:00:00.000Z']] });
});
test('duplicate canonical identities flow through genuine initial and authoritative clustering', async () => {
  const changed = syntheticTape(), raw = changed.files['inputs.json'].snapshot;
  const lead = raw.candidates.find(c => c.item.id === 'promote').item;
  raw.candidates.find(c => c.item.id === 'reject').item.canonicalUrl = lead.canonicalUrl;
  const actual = await fullSelector({ tape: changed, revision: FINAL, modelControls });
  assert.equal(actual.selectorReturned, true);
  const p = actual.preparation.preparation;
  for (const grouping of [p.initialGrouping, p.authoritativeGrouping]) {
    assert.ok(grouping.clusters.some(c => {
      const ids = [c.representativeFeedItemId, ...c.duplicateFeedItemIds];
      return ids.includes('promote') && ids.includes('reject');
    }));
  }
  assert.equal(p.rankedInventory.length, 16);
  assert.equal(p.groupingInput.length, 4);
  assert.equal(actual.actualProducerVerified, false);
});
