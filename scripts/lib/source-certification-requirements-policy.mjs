// Canonical source certification and live-evidence requirement guards, no filesystem or network access.
export function createSourceCertificationRequirementPolicy({
  sourceCertification,
  sourceCertificationPath,
  requiredProviderSignals,
  expectedCertificationRequirementCommands,
  expectedCertificationArtifactEnvs,
  fixtureOnlyProviders,
  evidence,
  violations,
  validateCommand,
}) {
  function validateSourceCertification() {
    if (sourceCertification.fixtureMode !== 'deterministic_no_network') {
      violations.push(`${sourceCertificationPath}: fixture certification must remain deterministic_no_network`);
    }

    const certified = new Map(
      (sourceCertification.certifiedProviders ?? []).map((provider) => [provider.providerKey, provider]),
    );

    for (const providerKey of requiredProviderSignals.keys()) {
      const provider = certified.get(providerKey);
      if (provider === undefined) {
        violations.push(`${sourceCertificationPath}: missing certified provider "${providerKey}"`);
        continue;
      }

      if (provider.readinessState !== 'enabled_beta') {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" must stay enabled_beta in fixture gate`);
      }
      if (!['fixture_ready', 'live_beta_ready'].includes(provider.runtimeReadiness)) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" has unsupported runtimeReadiness`);
      }
      if (provider.liveBetaReady === true && evidence.externalBetaStatus !== 'passed') {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" cannot be liveBetaReady before evidence passes`);
      }
      if (
        provider.liveBetaReady !== true &&
        (!Array.isArray(provider.liveBetaBlockers) || provider.liveBetaBlockers.length === 0)
      ) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" must declare live beta blockers`);
      }

      validateSourceCertificationLiveEvidenceRequirements(providerKey, provider);
    }

    for (const provider of sourceCertification.certifiedProviders ?? []) {
      if (
        provider.readinessState === 'enabled_beta' &&
        provider.runtimeReadiness !== 'deferred' &&
        !fixtureOnlyProviders.has(provider.providerKey) &&
        !requiredProviderSignals.has(provider.providerKey)
      ) {
        violations.push(
          `${sourceCertificationPath}: enabled_beta provider "${provider.providerKey}" must be covered by source live certification evidence`,
        );
      }
    }

    const fakeSource = certified.get('fake-source');
    if (fakeSource !== undefined && fakeSource.liveBetaReady !== false) {
      violations.push(`${sourceCertificationPath}: fake-source must never claim live beta readiness`);
    }
    if (fakeSource === undefined) {
      violations.push(`${sourceCertificationPath}: fake-source must remain certified as fixture-only evidence`);
    } else {
      if (fakeSource.readinessState !== 'certification_ready') {
        violations.push(`${sourceCertificationPath}: fake-source readinessState must be certification_ready`);
      }
      if (fakeSource.runtimeReadiness !== 'fixture_ready') {
        violations.push(`${sourceCertificationPath}: fake-source runtimeReadiness must be fixture_ready`);
      }
    }
  }

  function validateSourceCertificationLiveEvidenceRequirements(providerKey, provider) {
    const expectedSignals = requiredProviderSignals.get(providerKey) ?? new Set();
    const expectedCommand = expectedCertificationRequirementCommands.get(providerKey);
    const expectedArtifactEnv = expectedCertificationArtifactEnvs.get(providerKey);
    const requirements = provider.liveEvidenceRequirements;

    if (!Array.isArray(requirements) || requirements.length === 0) {
      violations.push(`${sourceCertificationPath}: provider "${providerKey}" must expose liveEvidenceRequirements`);
      return;
    }

    const actualSignals = new Set();
    for (const requirement of requirements) {
      if (typeof requirement.signalId !== 'string' || requirement.signalId.trim().length === 0) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" has liveEvidenceRequirement without signalId`);
        continue;
      }
      if (actualSignals.has(requirement.signalId)) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" has duplicate liveEvidenceRequirement "${requirement.signalId}"`);
      }
      actualSignals.add(requirement.signalId);

      if (!expectedSignals.has(requirement.signalId)) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" has unsupported liveEvidenceRequirement "${requirement.signalId}"`);
      }
      if (typeof requirement.description !== 'string' || requirement.description.trim().length === 0) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" requirement "${requirement.signalId}" must define description`);
      }
      validateCommand(
        requirement.verificationCommand,
        `provider "${providerKey}" requirement "${requirement.signalId}" verificationCommand`,
      );
      if (requirement.verificationCommand !== expectedCommand) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" requirement "${requirement.signalId}" must use expected certification command`);
      }
      if (requirement.requiredFor !== 'external_beta') {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" requirement "${requirement.signalId}" must be requiredFor=external_beta`);
      }
      if (requirement.artifactEnv !== expectedArtifactEnv) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" requirement "${requirement.signalId}" must use expected artifactEnv`);
      }
      if (
        requirement.artifactEnv !== undefined &&
        (typeof requirement.artifactEnv !== 'string' || !requirement.artifactEnv.endsWith('_EVIDENCE_PATH'))
      ) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" requirement "${requirement.signalId}" artifactEnv must end with _EVIDENCE_PATH`);
      }
    }

    for (const signalId of expectedSignals) {
      if (!actualSignals.has(signalId)) {
        violations.push(`${sourceCertificationPath}: provider "${providerKey}" missing liveEvidenceRequirement "${signalId}"`);
      }
    }
  }

  return { validateSourceCertification };
}
