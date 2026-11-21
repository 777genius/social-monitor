// Original artifact, environment, and package wiring admission; diagnostics retain legacy order.
export function createExternalBetaDryRunPackageAdmission(dependencies) {
  for (const name of ['runner', 'dryRun', 'plan', 'runnerPath', 'dryRunPath', 'packageScripts', 'backendScripts', 'baselineScripts', 'baselineArtifacts', 'packagePath', 'backendSafePath', 'baselinePath', 'violations', 'readFileSync', 'assertSameSet']) {
    if (dependencies?.[name] === undefined || dependencies[name] === null) {
      throw new TypeError('external beta dry-run package admission requires ' + name);
    }
  }
  if (typeof dependencies.readFileSync !== 'function' || typeof dependencies.assertSameSet !== 'function') {
    throw new TypeError('external beta dry-run package admission requires callable readFileSync and assertSameSet');
  }
  const { runner, dryRun, plan, runnerPath, dryRunPath, packageScripts, backendScripts, baselineScripts, baselineArtifacts, packagePath, backendSafePath, baselinePath, violations, readFileSync, assertSameSet } = dependencies;

  function validateArtifactCoverage() {
    const runnerEnvFormats = [
      ...new Set(
        (runner.jobs ?? [])
          .flatMap((job) => job.outputArtifacts ?? [])
          .filter((artifact) => artifact.env !== undefined)
          .map((artifact) => artifact.format),
      ),
    ];
    assertSameSet(runnerEnvFormats, dryRun.requiredArtifactFormats ?? [], `${dryRunPath}: requiredArtifactFormats`);

    const exampleFormats = new Set((runner.artifactExamples ?? []).map((example) => example.format));
    for (const format of dryRun.requiredArtifactFormats ?? []) {
      if (!exampleFormats.has(format)) {
        violations.push(`${runnerPath}: artifactExamples must include dry-run required format ${format}`);
      }
    }

    for (const job of runner.jobs ?? []) {
      const envArtifacts = (job.outputArtifacts ?? []).filter((artifact) => artifact.env !== undefined);
      if (job.runPolicy !== 'local_contract' && envArtifacts.length === 0) {
        violations.push(`${runnerPath}: ${job.jobId} external job must produce at least one env evidence artifact`);
      }
      for (const artifact of envArtifacts) {
        if (!dryRun.requiredMissingEnvWithoutCredentials?.includes(artifact.env)) {
          violations.push(`${dryRunPath}: ${artifact.env} must stay required in clean-env dry-run output`);
        }
      }
    }
  }

  function validateEnvExample() {
    const source = readFileSync(dryRun.envExample, 'utf8');
    const requiredEnv = new Set([
      ...(dryRun.requiredMissingEnvWithoutCredentials ?? []),
      ...(plan.uniqueMissingOptionalEnv ?? []),
    ]);

    for (const envName of requiredEnv) {
      const assignment = new RegExp(`^${escapeRegex(envName)}=`, 'm');
      if (!assignment.test(source)) {
        violations.push(`${dryRun.envExample}: must include ${envName}=`);
      }
      const nonEmptyAssignment = new RegExp(`^${escapeRegex(envName)}=\\S`, 'm');
      if (nonEmptyAssignment.test(source)) {
        violations.push(`${dryRun.envExample}: ${envName} must not have a committed value`);
      }
    }
  }

  function validateWiring() {
    if (packageScripts['check:external-beta-evidence-dry-run'] !== 'node scripts/check-external-beta-evidence-dry-run.mjs') {
      violations.push(`${packagePath}: check:external-beta-evidence-dry-run must run the dry-run checker`);
    }
    if (!backendScripts.has('check:external-beta-evidence-dry-run')) {
      violations.push(`${backendSafePath}: backendScripts must include check:external-beta-evidence-dry-run`);
    }
    if (!baselineScripts.has('check:external-beta-evidence-dry-run')) {
      violations.push(`${baselinePath}: requiredGreenScripts must include check:external-beta-evidence-dry-run`);
    }
    if (!baselineArtifacts.has(dryRunPath)) {
      violations.push(`${baselinePath}: trackedArtifacts must include ${dryRunPath}`);
    }
  }

  function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return { validateArtifactCoverage, validateEnvExample, validateWiring };
}
