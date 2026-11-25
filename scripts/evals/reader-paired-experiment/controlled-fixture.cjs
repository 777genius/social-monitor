'use strict';
// Synthetic compatibility inputs. Never a producer receipt or authority anchor.
const { syntheticTape, modelControls } = require('./full-selector-fixture.cjs');
const { clone } = require('./recorded-selector-ports.cjs');
const { digest } = require('./revision-source.cjs');
const { evaluationView, controlsDigest } = require('./controlled-evaluation-view.cjs');
function controlledFixture() {
  const tape = syntheticTape(), snapshot = tape.files['inputs.json'].snapshot;
  const q = tape.files['snapshot-query.json'], selection = tape.files['selection-query.json'];
  const observation = { format: 'paired-immutable-observation.v1', kind: 'synthetic_test_only',
    day: q.query.windowStartedAt.slice(0, 10), scope: { tenantId: q.query.tenantId, workspaceId: q.query.workspaceId },
    observationRef: { path: 'synthetic_test_only', sha256: tape.sealSha256 },
    observationQuery: clone(q.query), observationPresentKeys: clone(q.presentKeys),
    snapshot: clone(snapshot), startedAt: q.query.observedThrough, endedAt: q.query.observedThrough,
    interests: tape.files['interests.jsonl'].map(r => clone(r.event)), originalControls: clone(tape.files['controls.json']),
    provenance: { integrityVerified: false, independentOriginVerified: false, modelInvocationHistory: 'synthetic' },
    observationSha256: digest(snapshot) };
  const controls = { clock: q.query.observedThrough, snapshot: clone(q), selection: clone(selection),
    model: clone(modelControls), locale: 'en', interests: clone(observation.interests) };
  const declare = () => ({ kind: 'common_evaluation_controls', observationSha256: observation.observationSha256,
    originalControlsSha256: controlsDigest({ observationQuery: observation.observationQuery,
      observationPresentKeys: observation.observationPresentKeys, controls: observation.originalControls, interests: observation.interests }),
    evaluationControlsSha256: controlsDigest(controls) });
  return { tape, observation, controls, declare, view: () => evaluationView(observation, controls, declare()) };
}
module.exports = { controlledFixture };
