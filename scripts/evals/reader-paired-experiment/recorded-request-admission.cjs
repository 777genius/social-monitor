'use strict';
// Uses the same concrete admission and canonical-hash functions as P2's guarded
// model callback. No executor/client is loaded. A matching hash establishes
// request consistency only; it cannot establish the capture's real origin.
function verifyRecordedRequestAdmission(source, command, result) {
  const { admitSubscriptionRuntimeRequest } = source.load(
    'apps/agent-runtime/src/subscription-runtime-purpose-model-policy.ts');
  const { canonicalJsonSha256 } = source.load(
    'libs/contracts/grpc/agent_runtime/v1/execution-attestation.ts');
  const admitted = source.invoke(admitSubscriptionRuntimeRequest, [{ ...command,
    providerInstanceId: command.providerInstanceId?.trim() || undefined,
    cwd: command.cwd?.trim() || undefined,
    outputSchemaJson: JSON.stringify(command.outputSchema),
    controlsJson: JSON.stringify(command.controls),
    metadata: command.metadata ?? {},
  }]);
  const expected = source.invoke(canonicalJsonSha256, [admitted.canonicalRequest]);
  if (result.executionAttestation?.canonicalRequestSha256 !== expected) {
    throw Error('canonical_runtime_request_mismatch');
  }
  return { canonicalRequestSha256: expected, profile: admitted.profile };
}
module.exports = { verifyRecordedRequestAdmission };
