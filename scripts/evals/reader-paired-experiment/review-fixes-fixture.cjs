'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { p2Fixture, ownerContractReceipt } = require('./p2-fixture.cjs');
const { p2Observation } = require('./p2-observation.cjs');
const { controlledFixture } = require('./controlled-fixture.cjs');
const { evaluationView, controlsDigest } = require('./controlled-evaluation-view.cjs');
const { sha, revisionSource, FINAL } = require('./revision-source.cjs');
const { replayHost } = require('./replay-host.cjs');
const { ledger, clone } = require('./recorded-selector-ports.cjs');
const { recordedResponses } = require('./recorded-model-responses.cjs');
const { modelControls } = require('./full-selector-fixture.cjs');
function setup(tapes) {
  const host = replayHost(), clock = { now: () => new Date('2026-09-05T21:59:00.000Z') };
  const source = revisionSource(process.cwd(), FINAL, clock.now().toISOString(), host), gaps = ledger();
  const replay = recordedResponses(source, tapes, gaps, clock, modelControls, { mode: 'CONTROLLED', host });
  const requests = JSON.parse(tapes[0].files['assessments.jsonl'][0].event.requestsJson);
  return { host, source, gaps, replay, requests };
}
function rebind(source, event) {
  const admit = source.load('apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts').admitSubscriptionRuntimeRequest;
  const hash = source.load('libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts').canonicalJsonSha256;
  const command = event.command, result = event.result;
  const admitted = source.invoke(admit, [{ ...command, providerInstanceId: command.providerInstanceId, cwd: undefined,
    outputSchemaJson: JSON.stringify(command.outputSchema), controlsJson: JSON.stringify(command.controls), metadata: command.metadata ?? {} }]);
  result.executionAttestation.requestId = command.requestId;
  result.executionAttestation.canonicalRequestSha256 = source.invoke(hash, [admitted.canonicalRequest]);
  result.executionAttestation.selectedOutputSha256 = source.invoke(hash, [result.structuredOutput]);
}
// Artificial local trust-boundary fixture only; no real capture is certified.
function trustedFixture(mutate) {
  const f = p2Fixture(tape => {
    delete tape.seal.synthetic; delete tape.files['controls.json'].synthetic;
    mutate(tape);
  });
  const receiptDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'review-fixes-owner-'));
  const cleanup = () => { f.cleanup(); fs.rmSync(receiptDirectory, { recursive: true, force: true }); };
  try {
    const tape = p2Observation(f.ref).tape;
    const bytes = JSON.stringify(ownerContractReceipt(tape)), filename = `${receiptDirectory}/owner.json`;
    fs.writeFileSync(filename, bytes);
    const admitted = p2Observation({ ...f.ref, ownerReceipt: { path: filename, sha256: sha(bytes) } }, [sha(bytes)]);
    const observation = admitted.observation, controls = controlledFixture().controls;
    const declaration = { kind: 'common_evaluation_controls', observationSha256: observation.observationSha256,
      originalControlsSha256: controlsDigest({ observationQuery: observation.observationQuery,
        observationPresentKeys: observation.observationPresentKeys, controls: observation.originalControls, interests: observation.interests }),
      evaluationControlsSha256: controlsDigest(controls) };
    return { ...f, cleanup, admitted, args: { revision: FINAL, mode: 'CONTROLLED', modelControls: controls.model,
      evaluation: evaluationView(observation, controls, declaration), responseTapes: [admitted.tape] } };
  } catch (error) { cleanup(); throw error; }
}
module.exports = { setup, rebind, trustedFixture, clone };
