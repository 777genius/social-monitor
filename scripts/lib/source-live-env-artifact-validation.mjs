import { isRecord } from './source-live-certification-evidence-shape.mjs';

export function validateEnvArtifactValidation(validationRules, context) {
  const { evidencePath, liveArtifactFormat, violations } = context;
  if (!Array.isArray(validationRules)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.envArtifactValidation must be an array`);
    return;
  }

  const expectedRules = new Map([
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github-issues'])],
    ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH', new Set(['github-repo-radar'])],
    ['GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', new Set(['github-trending-page'])],
    ['REDDIT_LIVE_EVIDENCE_PATH', new Set(['reddit'])],
  ]);
  const seenRules = new Set();
  for (const [index, rule] of validationRules.entries()) {
    const label = `passedArtifactContentSchema.envArtifactValidation[${index}]`;
    if (!isRecord(rule)) {
      violations.push(`${evidencePath}: ${label} must be an object`);
      continue;
    }
    if (rule.envVar === 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH') {
      seenRules.add(rule.envVar);
      if (rule.kind !== 'reddit-credential-lifecycle-redacted') {
        violations.push(`${evidencePath}: ${label}.kind must be reddit-credential-lifecycle-redacted`);
      }
      if (rule.sha256MustMatchSignal !== 'reddit-credential-lifecycle') {
        violations.push(`${evidencePath}: ${label}.sha256MustMatchSignal must be reddit-credential-lifecycle`);
      }
      if (Array.isArray(rule.requiredEnv) && rule.requiredEnv.length > 0) {
        violations.push(`${evidencePath}: ${label}.requiredEnv must be empty because lifecycle grants can predate the current release artifact`);
      }
      continue;
    }

    const expectedProviders = expectedRules.get(rule.envVar);
    if (expectedProviders === undefined) {
      violations.push(`${evidencePath}: ${label}.envVar is unsupported`);
      continue;
    }
    seenRules.add(rule.envVar);
    requireProviderSetCoverage(new Set(rule.requiredProviders ?? []), expectedProviders, label, context);
    if (rule.format !== liveArtifactFormat) {
      violations.push(`${evidencePath}: ${label}.format must be ${liveArtifactFormat}`);
    }
    for (const envVar of ['SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
      if (!rule.requiredEnv?.includes(envVar)) {
        violations.push(`${evidencePath}: ${label}.requiredEnv must include ${envVar}`);
      }
    }
  }

  for (const envVar of [
    ...expectedRules.keys(),
    'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
  ]) {
    if (!seenRules.has(envVar)) {
      violations.push(`${evidencePath}: envArtifactValidation must include ${envVar}`);
    }
  }
}

function requireProviderSetCoverage(actual, expected, label, { evidencePath, violations }) {
  for (const providerKey of expected) {
    if (!actual.has(providerKey)) {
      violations.push(`${evidencePath}: ${label}.requiredProviders must include ${providerKey}`);
    }
  }
}

