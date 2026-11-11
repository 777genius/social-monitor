export function createSourceLiveProviderEvidenceValidator({
  evidence,
  evidencePath,
  violations,
  requiredProviderSignals,
  liveStatusValues,
  expectedLiveCommands,
  validateCommand,
  requireExistingPath,
  validatePassedProviderArtifact,
}) {
  function validateLiveProviderEvidence() {
    const providers = new Map();
    let hasPendingProvider = false;
  
    for (const provider of evidence.liveProviderEvidence ?? []) {
      if (providers.has(provider.providerKey)) {
        violations.push(`${evidencePath}: duplicate live provider "${provider.providerKey}"`);
      }
      providers.set(provider.providerKey, provider);
  
      if (!requiredProviderSignals.has(provider.providerKey)) {
        violations.push(`${evidencePath}: unsupported live provider "${provider.providerKey}"`);
      }
      if (!liveStatusValues.has(provider.status)) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" has unsupported status "${provider.status}"`);
      }
      if (provider.requiredForExternalBeta !== true) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" must be required for external beta`);
      }
      if (typeof provider.owner !== 'string' || provider.owner.trim().length === 0) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" must define owner`);
      }
      if (provider.liveSmokeCommand !== expectedLiveCommands.get(provider.providerKey)) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" must use expected live smoke command`);
      }
      validateCommand(provider.liveSmokeCommand, `provider "${provider.providerKey}" liveSmokeCommand`);
      validateProviderEvidenceFields(provider);
      validateProviderSignals(provider);
  
      if (typeof provider.exitCondition !== 'string' || provider.exitCondition.trim().length === 0) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" must define exitCondition`);
      }
  
      if (provider.status !== 'passed') {
        hasPendingProvider = true;
      }
    }
  
    for (const providerKey of requiredProviderSignals.keys()) {
      if (!providers.has(providerKey)) {
        violations.push(`${evidencePath}: missing live provider "${providerKey}"`);
      }
    }
  
    if (providers.has('fake-source')) {
      violations.push(`${evidencePath}: fake-source must not be a live provider evidence target`);
    }
  
    if (evidence.externalBetaStatus === 'passed' && hasPendingProvider) {
      violations.push(`${evidencePath}: externalBetaStatus cannot be passed while a provider is pending`);
    }
  }
  
  function validateProviderEvidenceFields(provider) {
    if (provider.status === 'pending_live_evidence') {
      for (const field of ['stagingArtifactPath', 'environmentId', 'imageDigest', 'commitSha', 'sampledAt']) {
        if (provider[field] !== null) {
          violations.push(`${evidencePath}: pending provider "${provider.providerKey}" must keep ${field}=null`);
        }
      }
      return;
    }
  
    requireExistingPath(provider.stagingArtifactPath, `provider "${provider.providerKey}" stagingArtifactPath`);
    for (const field of ['environmentId', 'sampledAt']) {
      if (typeof provider[field] !== 'string' || provider[field].trim().length === 0) {
        violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define ${field}`);
      }
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(provider.imageDigest ?? ''))) {
      violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define immutable imageDigest`);
    }
    if (!/^[0-9a-f]{40}$/.test(String(provider.commitSha ?? ''))) {
      violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must define full commitSha`);
    }
    validatePassedProviderArtifact(provider);
  }
  
  function validateProviderSignals(provider) {
    const requiredSignals = requiredProviderSignals.get(provider.providerKey) ?? new Set();
    const signals = new Set();
  
    for (const signal of provider.signals ?? []) {
      if (signals.has(signal.signalId)) {
        violations.push(`${evidencePath}: duplicate signal "${signal.signalId}" for provider "${provider.providerKey}"`);
      }
      signals.add(signal.signalId);
  
      if (!requiredSignals.has(signal.signalId)) {
        violations.push(`${evidencePath}: unsupported signal "${signal.signalId}" for provider "${provider.providerKey}"`);
      }
      if (!liveStatusValues.has(signal.status)) {
        violations.push(`${evidencePath}: signal "${signal.signalId}" has unsupported status "${signal.status}"`);
      }
      if (provider.status === 'pending_live_evidence' && signal.status !== 'pending_live_evidence') {
        violations.push(`${evidencePath}: pending provider "${provider.providerKey}" must keep signal "${signal.signalId}" pending`);
      }
      if (provider.status === 'passed' && signal.status !== 'passed') {
        violations.push(`${evidencePath}: passed provider "${provider.providerKey}" must have passed signal "${signal.signalId}"`);
      }
      if (typeof signal.requiredSignal !== 'string' || signal.requiredSignal.trim().length === 0) {
        violations.push(`${evidencePath}: signal "${signal.signalId}" must define requiredSignal`);
      }
    }
  
    for (const signalId of requiredSignals) {
      if (!signals.has(signalId)) {
        violations.push(`${evidencePath}: provider "${provider.providerKey}" missing signal "${signalId}"`);
      }
    }
  }

  return { validateLiveProviderEvidence };
}
