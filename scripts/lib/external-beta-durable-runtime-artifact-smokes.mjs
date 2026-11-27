/**
 * Runs durable-runtime artifact contract smokes with the checker's live dependencies.
 * The caller owns scenario selection and subprocess policy; this module owns fixture
 * construction, private temporary files, matching diagnostics and guaranteed cleanup.
 */
export function createExternalBetaDurableRuntimeArtifactSmokes({
  contract, violations, shouldRunNegativeSmoke, negativeSmokeOptions,
  durableRuntimeNegativeSmokeScenarios, runRunnerDurableRuntimeArtifactSmoke,
  smokeOutputSnippet, mkdtempSync, tmpdir, join, writeFileSync, rmSync,
  readJson, nowIso,
}) {
  function validateRunnerPositiveDurableRuntimeArtifactSmoke() {
    const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-positive-'));
    try {
      const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory);
      const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, { contractSmokeArtifactOnly: true });
      if (result.exitCode !== 0) {
        violations.push(`${contract.runnerFile}: runner positive durable runtime artifact smoke must accept a valid runtime selector artifact: ${smokeOutputSnippet(result.output)}`);
      }
    } finally {
      rmSync(tempDirectory, { recursive: true, force: true });
    }
  }

  function validateRunnerNegativeDurableRuntimeArtifactSmokes() {
    const scenarios = durableRuntimeNegativeSmokeScenarios();

    for (const scenario of scenarios) {
      if (!shouldRunNegativeSmoke(scenario.label)) {
        continue;
      }
      const tempDirectory = mkdtempSync(join(tmpdir(), 'external-beta-evidence-runner-durable-negative-'));
      try {
        const artifactPath = writeDurableRuntimeSelectorArtifact(tempDirectory, scenario);
        const result = runRunnerDurableRuntimeArtifactSmoke(artifactPath, negativeSmokeOptions(scenario.label));
        if (result.exitCode === 0) {
          violations.push(`${contract.runnerFile}: runner negative durable runtime smoke must reject ${scenario.label}`);
          continue;
        }
        if (!result.output.includes(scenario.expectedOutput)) {
          violations.push(`${contract.runnerFile}: runner negative durable runtime smoke for ${scenario.label} must report "${scenario.expectedOutput}"`);
        }
      } finally {
        rmSync(tempDirectory, { recursive: true, force: true });
      }
    }
  }

  function writeDurableRuntimeSelectorArtifact(tempDirectory, options = {}) {
    const artifactPath = join(tempDirectory, 'durable-runtime-selector.json');
    const artifact = durableRuntimeSelectorArtifact();
    options.mutateArtifact?.(artifact);
    const artifactContent = typeof options.artifactContent === 'function'
      ? options.artifactContent(artifact)
      : `${JSON.stringify(artifact, null, 2)}\n`;
    writeFileSync(
      artifactPath,
      artifactContent,
      { mode: 0o600 },
    );
    return artifactPath;
  }

  function durableRuntimeSelectorArtifact() {
    const artifact = readJson('ops/release/fixtures/durable-runtime-selector-artifact-examples.json');
    const now = nowIso();
    const imageDigest = `sha256:${'d'.repeat(64)}`;
    artifact.provenance = {
      evidenceKind: 'staging_runtime_selector',
      collectionMethod: 'Runtime selector snapshot captured from beta staging deployment.',
      runner: 'scripts/capture-durable-runtime-selector.ts',
      fixtureOnly: false,
    };
    artifact.environment = {
      environmentId: 'staging-alpha-1',
      imageDigest,
      apiBaseUrl: 'https://api.staging.social-monitor.invalid',
      sampledAt: now,
      operator: 'release-operator-1',
    };
    artifact.services = artifact.services.map((service) => ({
      ...service,
      healthCheck: {
        ...service.healthCheck,
        checkedAt: now,
      },
    }));
    return artifact;
  }

  return {
    validateRunnerPositiveDurableRuntimeArtifactSmoke,
    validateRunnerNegativeDurableRuntimeArtifactSmokes,
  };
}
