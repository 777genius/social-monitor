export function createStagingReliabilityReleaseWiringPolicy({
  violations,
  releaseContract,
  releaseContractPath,
  gateId,
  gateCommand,
  gateScript,
  backendOps,
  backendOpsPath,
  requiredBackendOpsDomains,
  evidencePath,
  externalReadiness,
  externalReadinessPath,
  requiredExternalGroups,
  baseline,
  baselinePath,
  evidence,
}) {
  function requireReleaseWiring() {
    const releaseGateIds = new Set(
      (releaseContract.requiredGates ?? []).map((gate) => gate.gateId),
    );
    const releaseGateCommands = new Set(
      (releaseContract.requiredGates ?? []).map((gate) => gate.command),
    );
  
    if (!releaseGateIds.has(gateId)) {
      violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
    }
    if (!releaseGateCommands.has(gateCommand)) {
      violations.push(
        `${releaseContractPath}: release gates must include ${gateScript}`,
      );
    }
  }
  
  function requireBackendOpsWiring() {
    for (const domainId of requiredBackendOpsDomains) {
      const domain = (backendOps.requiredDomains ?? []).find(
        (item) => item.domainId === domainId,
      );
      if (domain === undefined) {
        violations.push(
          `${backendOpsPath}: missing backend ops domain "${domainId}"`,
        );
        continue;
      }
      if (!domain.gates?.includes(gateScript)) {
        violations.push(
          `${backendOpsPath}: domain "${domainId}" must include ${gateScript}`,
        );
      }
      if (!domain.releaseGateIds?.includes(gateId)) {
        violations.push(
          `${backendOpsPath}: domain "${domainId}" must include ${gateId} release gate`,
        );
      }
      if (!domain.artifacts?.includes(evidencePath)) {
        violations.push(
          `${backendOpsPath}: domain "${domainId}" must include ${evidencePath}`,
        );
      }
    }
  }
  
  function requireExternalReadinessWiring() {
    for (const groupId of requiredExternalGroups) {
      const group = (externalReadiness.requiredEvidenceGroups ?? []).find(
        (item) => item.groupId === groupId,
      );
      if (group === undefined) {
        violations.push(
          `${externalReadinessPath}: missing external readiness group "${groupId}"`,
        );
        continue;
      }
      if (!group.verificationCommands?.includes(gateCommand)) {
        violations.push(
          `${externalReadinessPath}: group "${groupId}" must include ${gateScript}`,
        );
      }
      if (!group.requiredArtifacts?.includes(evidencePath)) {
        violations.push(
          `${externalReadinessPath}: group "${groupId}" must include ${evidencePath}`,
        );
      }
    }
  }
  
  function requireBaselineWiring() {
    if (!baseline.requiredGreenScripts?.includes(gateScript)) {
      violations.push(
        `${baselinePath}: requiredGreenScripts must include ${gateScript}`,
      );
    }
    if (
      !(baseline.trackedArtifacts ?? []).some(
        (artifact) => artifact.path === evidencePath,
      )
    ) {
      violations.push(
        `${baselinePath}: trackedArtifacts must include ${evidencePath}`,
      );
    }
    const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
    if (
      typeof examplePath === "string" &&
      !(baseline.trackedArtifacts ?? []).some(
        (artifact) => artifact.path === examplePath,
      )
    ) {
      violations.push(
        `${baselinePath}: trackedArtifacts must include ${examplePath}`,
      );
    }
  }

  return {
    requireReleaseWiring,
    requireBackendOpsWiring,
    requireExternalReadinessWiring,
    requireBaselineWiring,
  };
}
