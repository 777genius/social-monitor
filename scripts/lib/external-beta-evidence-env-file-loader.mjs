/** Private file admission is owned here; the CLI retains path-validation policy. */
export function createExternalBetaEnvFileLoader({ parseDotenv, readFileSync, validateExternalBetaEnvFilePath, env }) {
  function loadExternalBetaEnvFiles(paths) {
    const violations = [];
    const loadedSources = new Map();
    for (const path of paths) {
      const label = `--env-file ${path}`;
      validateExternalBetaEnvFilePath(path, label, violations);
      if (violations.some((violation) => violation.startsWith(`${label}:`))) {
        continue;
      }

      const parsed = parseDotenv(readFileSync(path, 'utf8'));
      for (const [name, rawValue] of Object.entries(parsed)) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) {
          violations.push(`${label}: env name ${name} is not a valid uppercase env var name`);
          continue;
        }

        const value = String(rawValue).trim();
        if (value.length === 0) {
          continue;
        }
        if (name === 'EXTERNAL_BETA_EVIDENCE_CONFIRM') {
          violations.push(`${label}: EXTERNAL_BETA_EVIDENCE_CONFIRM must be set explicitly in the operator shell, not loaded from --env-file`);
          continue;
        }

        const existingValue = env[name]?.trim();
        if (existingValue !== undefined && existingValue.length > 0 && existingValue !== value) {
          const existingSource = loadedSources.get(name) ?? 'the shell environment';
          violations.push(`${label}: env ${name} conflicts with ${existingSource}; refusing to merge evidence from different runs`);
          continue;
        }

        env[name] = value;
        loadedSources.set(name, label);
      }
    }

    return violations;
  }

  return { loadExternalBetaEnvFiles };
}
