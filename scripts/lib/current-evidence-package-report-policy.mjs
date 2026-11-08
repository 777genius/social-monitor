/**
 * Validate the current external-beta evidence package report in the original
 * diagnostic order. The caller owns the violations array and expected commit.
 */
export function validateCurrentEvidencePackageReport(report, commitSha, violations) {
  if (report.artifactFormat !== 'external-beta-current-evidence-package-v1') {
    violations.push('current evidence package report must use the expected artifact format');
  }
  if (report.inputPolicy?.secretValuesIncluded !== false) {
    violations.push('current evidence package report must state that secret values are excluded');
  }
  if (report.commitPolicy?.expectedCommitSha !== commitSha || report.commitPolicy?.packagedCommitSha !== commitSha) {
    violations.push('current evidence package report must expose the expected and packaged commit SHA');
  }
  if (!Array.isArray(report.artifactIntegrity?.inputEnvFiles) || report.artifactIntegrity.inputEnvFiles.length !== 7) {
    violations.push('current evidence package report must include input env file integrity records');
  }
  if (!Array.isArray(report.artifactIntegrity?.packagedEvidenceArtifacts) || report.artifactIntegrity.packagedEvidenceArtifacts.length === 0) {
    violations.push('current evidence package report must include packaged evidence artifact integrity records');
  }
  const digestPattern = /^[0-9a-f]{64}$/;
  for (const record of [
    ...(report.artifactIntegrity?.inputEnvFiles ?? []),
    ...(report.artifactIntegrity?.packagedEvidenceArtifacts ?? []),
  ]) {
    if (!digestPattern.test(String(record.sha256 ?? '')) || !Number.isInteger(record.sizeBytes) || record.sizeBytes <= 0) {
      violations.push('current evidence package integrity records must include sha256 and positive sizeBytes');
      break;
    }
  }
  const artifactIntegrityEnvNames = new Set(
    (report.artifactIntegrity?.packagedEvidenceArtifacts ?? []).map((record) => record.envName),
  );
  if (!artifactIntegrityEnvNames.has('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash live-open evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash GitHub Repo Radar evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash GitHub Trending Page evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH')) {
    violations.push('current evidence package report must hash relevance memory canary evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('SECURITY_FINAL_SWEEP_ARTIFACT_PATH')) {
    violations.push('current evidence package report must hash security final sweep evidence artifact');
  }
  if (!artifactIntegrityEnvNames.has('SUMMARY_REAL_FEEDBACK_SAMPLES_PATH')) {
    violations.push('current evidence package report must hash summary feedback sample evidence artifact');
  }
  if (!report.inputPolicy?.secretEnvNamesWithheld?.includes('DATABASE_URL')) {
    violations.push('current evidence package report must list withheld DATABASE_URL');
  }
  if (!report.inputPolicy?.secretEnvNamesWithheld?.includes('INFINITY_CONTEXT_TOKEN')) {
    violations.push('current evidence package report must list withheld INFINITY_CONTEXT_TOKEN');
  }
  if (!Array.isArray(report.remaining?.requiredEnv)) {
    violations.push('current evidence package report must include remaining required env names');
  }
  if (!Number.isInteger(report.readiness?.activeExternalEvidenceBlockerJobCount)) {
    violations.push('current evidence package report must include active external evidence blocker count');
  }
  if (!Array.isArray(report.remaining?.activeBlockerJobs)) {
    violations.push('current evidence package report must include active blocker jobs');
  }
  const requiredAlternativeGroups = report.remaining?.requiredAlternativeGroups ?? [];
  if (!Array.isArray(requiredAlternativeGroups)) {
    violations.push('current evidence package report must include remaining required alternative groups');
  } else {
    const redditRefreshAlternative = requiredAlternativeGroups.find((group) => (
      group.jobId === 'live-reddit-oauth'
      && group.label === 'reddit_refresh_token_flow'
    ));
    if (redditRefreshAlternative === undefined) {
      violations.push('current evidence package report must expose Reddit refresh-token alternative when Reddit evidence is missing');
    } else if (!redditRefreshAlternative.missingEnv?.includes('REDDIT_REFRESH_TOKEN')) {
      violations.push('current evidence package report must mark missing Reddit refresh token in the refresh-token alternative');
    }
  }
}
