'use strict';
const { read, date } = require('./frozen-input.cjs');
const { check, digest } = require('./revision-source.cjs');
const { canonical, same } = require('./recorded-selector-ports.cjs');
const hash = value => digest(canonical(value));
// Trust enters ONLY through the execution owner's separate argument. A hash
// declared by the manifest/tape itself supplies integrity, never authority.
function anchored(ref, expectedReceiptSha256s) {
  check(ref && /^[a-f0-9]{64}$/.test(ref.sha256) &&
    Array.isArray(expectedReceiptSha256s) && expectedReceiptSha256s.includes(ref.sha256), 'owner_receipt_out_of_band_anchor_missing');
  return read(ref);
}
function p2OwnerReceipt(tape, ref, expectedReceiptSha256s) {
  const receipt = anchored(ref, expectedReceiptSha256s);
  const started = tape.files['started.json'], controls = tape.files['controls.json'], manifest = controls.manifest;
  check(receipt.format === 'paired-p2-local-owner-receipt.v1' &&
    receipt.authority === 'local_execution_owner_attestation' && receipt.action === 'actual_p2_apply', 'owner_receipt_contract_invalid');
  check(!tape.seal.synthetic && !controls.synthetic && !receipt.synthetic, 'synthetic_capture_has_no_real_authority');
  check(receipt.captureSealSha256 === tape.sealSha256 && same(receipt.scope, started.scope) &&
    receipt.operationId === started.scope.operation && receipt.operationId === manifest.operation &&
    receipt.commandManifestSha256 === hash(manifest) &&
    ['tenantId', 'workspaceId', 'observedThrough'].every(key => manifest[key] === started.scope[key]), 'owner_receipt_capture_join_mismatch');
  check(/^[a-f0-9]{40}$/.test(receipt.reviewedSourceCommit) && receipt.reviewedSourceCommit === receipt.deployedSourceCommit &&
    /^sha256:[a-f0-9]{64}$/.test(receipt.imageId) && /^[a-f0-9]{64}$/.test(receipt.ownedContainerId) &&
    /^[a-f0-9]{64}$/.test(receipt.sourceSha256) && receipt.sourceSha256 === manifest.sourceSha256 &&
    receipt.sourceSha256 === manifest.deployedSourceSha256 && same(receipt.runtime, manifest.runtime), 'owner_receipt_runtime_identity_mismatch');
  check(receipt.runtime?.engine === 'subscription-runtime-cli' && typeof receipt.runtime.packageVersion === 'string' &&
    receipt.runtime.packageVersion.trim() && /^[a-f0-9]{64}$/.test(receipt.runtime.launcherSha256), 'owner_receipt_runtime_identity_invalid');
  const start = +date(receipt.startedAt), end = +date(receipt.endedAt);
  check(end >= start && receipt.terminal?.status === 'exited' && receipt.terminal.exitCode === 0 &&
    Number.isSafeInteger(started.atMs) && started.atMs >= start && started.atMs <= end, 'owner_receipt_execution_incomplete');
  for (const [name, rows] of Object.entries(tape.files)) if (name.endsWith('.jsonl'))
    check(rows.every(row => row.atMs >= started.atMs && row.atMs <= end), 'owner_receipt_lifecycle_outside_execution');
  return { receiptSha256: ref.sha256, receipt, model: manifest.model, reasoningEffort: manifest.reasoningEffort, authority: 'local_execution_owner_attestation',
    remoteExecutionCryptographicallyAuthenticated: false };
}
function verifyOwnerInvocation(origin, command, result) {
  const runtime = origin.receipt.runtime, attestation = result.executionAttestation;
  check(same({ engine: attestation?.runtimeEngine, packageVersion: attestation?.runtimePackageVersion,
    launcherSha256: attestation?.launcherSha256 }, runtime), 'owner_invocation_runtime_mismatch');
  check(command.tenantId === origin.receipt.scope.tenantId && command.workspaceId === origin.receipt.scope.workspaceId,
    'owner_invocation_scope_mismatch');
  check(command.provider === 'codex' && command.controls.model === origin.model &&
    command.controls.reasoningEffort === origin.reasoningEffort, 'owner_invocation_model_mismatch');
  // Request/output/transport IDs and model controls are checked by the actual
  // revision admission, envelope validators and parsers, not a second schema.
}
module.exports = { anchored, p2OwnerReceipt, verifyOwnerInvocation, hash };
