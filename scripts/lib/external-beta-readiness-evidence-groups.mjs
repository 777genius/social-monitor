const requiredGroupIds = new Set([
  'release-baseline-freeze',
  'durable-runtime-proof',
  'production-auth-finalization',
  'source-provider-live-certification',
  'credential-secret-runtime-flow',
  'rabbitmq-staging-reliability-drill',
  'postgres-restore-migration-drill',
  'durable-backend-e2e-loop',
  'summary-quality-feedback-hardening',
  'operational-support-package',
  'capacity-envelope-beta-ring-decision',
  'release-artifact-evidence',
  'security-final-sweep',
  'no-go-cleanup',
]);
const allowedStatuses = new Set([
  'contract_ready',
  'pending_staging_evidence',
  'blocked_without_live_credentials',
  'blocked_until_real_feedback',
  'pending_image_digest_and_deploy_smoke',
  'hold',
  'passed',
]);

export function validateExternalBetaEvidenceGroups({ contract, scripts, existsSync, contractPath, violations }) {
  const groupIds = new Set();
  let hasBlockingPendingEvidence = false;
  for (const group of contract.requiredEvidenceGroups ?? []) {
    if (groupIds.has(group.groupId)) {
      violations.push(`${contractPath}: duplicate evidence group "${group.groupId}"`);
    }
    groupIds.add(group.groupId);

    if (!requiredGroupIds.has(group.groupId)) {
      violations.push(`${contractPath}: unsupported evidence group "${group.groupId}"`);
    }
    if (!allowedStatuses.has(group.status)) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" has unsupported status "${group.status}"`);
    }
    if (typeof group.owner !== 'string' || group.owner.trim().length === 0) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" must define owner`);
    }
    if (group.blocksExternalBeta !== true) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" must block external beta until passed`);
    }
    if (group.status !== 'passed') {
      hasBlockingPendingEvidence = true;
    }

    for (const command of group.verificationCommands ?? []) {
      const scriptName = String(command).replace(/^npm run /, '');
      if (!scripts[scriptName]) {
        violations.push(`${contractPath}: evidence group "${group.groupId}" references missing script "${scriptName}"`);
      }
    }

    for (const artifact of group.requiredArtifacts ?? []) {
      if (!existsSync(artifact)) {
        violations.push(`${contractPath}: evidence group "${group.groupId}" references missing artifact "${artifact}"`);
      }
    }

    if (typeof group.exitCondition !== 'string' || group.exitCondition.trim().length === 0) {
      violations.push(`${contractPath}: evidence group "${group.groupId}" must define exitCondition`);
    }
  }

  for (const groupId of requiredGroupIds) {
    if (!groupIds.has(groupId)) {
      violations.push(`${contractPath}: missing required evidence group "${groupId}"`);
    }
  }

  if (contract.externalBetaDecision === 'go' && hasBlockingPendingEvidence) {
    violations.push(`${contractPath}: externalBetaDecision cannot be go while blocking evidence is not passed`);
  }
}
