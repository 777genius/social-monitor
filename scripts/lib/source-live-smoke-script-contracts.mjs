export function createSourceLiveSmokeScriptContracts({
  readFileSync, violations, requiredProviderSignals, liveArtifactFormat,
  liveOpenScriptPath, liveOpenCaptureScriptPath, redditLiveScriptPath, redditLiveCaptureScriptPath,
  redditOAuthLocalCallbackScriptPath, githubRepoRadarLiveScriptPath, githubRepoRadarPrismaLiveE2eScriptPath, githubTrendingPageLiveScriptPath,
  githubTrendingPageCaptureScriptPath, redditSourceProviderPath, redditRefreshTokenProviderPath, liveEvidenceArtifactHelperPath,
}) {
  function validateLiveSmokeScriptContracts() {
    const liveOpenScript = readFileSync(liveOpenScriptPath, 'utf8');
    const liveOpenCaptureScript = readFileSync(liveOpenCaptureScriptPath, 'utf8');
    const redditLiveScript = readFileSync(redditLiveScriptPath, 'utf8');
    const redditLiveCaptureScript = readFileSync(redditLiveCaptureScriptPath, 'utf8');
    const redditOAuthLocalCallbackScript = readFileSync(redditOAuthLocalCallbackScriptPath, 'utf8');
    const githubRepoRadarLiveScript = readFileSync(githubRepoRadarLiveScriptPath, 'utf8');
    const githubRepoRadarPrismaLiveE2eScript = readFileSync(githubRepoRadarPrismaLiveE2eScriptPath, 'utf8');
    const githubTrendingPageLiveScript = readFileSync(githubTrendingPageLiveScriptPath, 'utf8');
    const githubTrendingPageCaptureScript = readFileSync(githubTrendingPageCaptureScriptPath, 'utf8');
    const redditSourceProviderScript = readFileSync(redditSourceProviderPath, 'utf8');
    const redditRefreshTokenProviderScript = readFileSync(redditRefreshTokenProviderPath, 'utf8');
    const liveEvidenceArtifactHelper = readFileSync(liveEvidenceArtifactHelperPath, 'utf8');

    requireScriptSignals(liveOpenScriptPath, liveOpenScript, [
      ...requiredProviderSignals.get('hacker-news'),
      ...requiredProviderSignals.get('rss'),
      ...requiredProviderSignals.get('github-issues'),
    ]);
    requireScriptSignals(
      githubRepoRadarLiveScriptPath,
      githubRepoRadarLiveScript,
      [
        'github-repo-radar-gh-archive-query',
        'github-repo-radar-live-verification',
        'github-repo-radar-live-smoke',
      ],
    );
    requireScriptSignals(
      githubRepoRadarPrismaLiveE2eScriptPath,
      githubRepoRadarPrismaLiveE2eScript,
      [...requiredProviderSignals.get('github-repo-radar')],
    );
    requireScriptSignals(
      githubTrendingPageLiveScriptPath,
      githubTrendingPageLiveScript,
      [...requiredProviderSignals.get('github-trending-page')],
    );
    requireScriptSignals(redditLiveScriptPath, redditLiveScript, [...requiredProviderSignals.get('reddit')]);

    if (!liveOpenScript.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH')) {
      violations.push(`${liveOpenScriptPath}: live open connector smoke must support redacted evidence artifact output`);
    }
    if (!liveOpenCaptureScript.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_ENV_PATH')) {
      violations.push(`${liveOpenCaptureScriptPath}: live open connector capture must write a credentialless evidence env handoff`);
    }
    for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath', 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', 'SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
      if (!liveOpenCaptureScript.includes(marker)) {
        violations.push(`${liveOpenCaptureScriptPath}: live open connector env handoff must include ${marker}`);
      }
    }
    if (!liveOpenCaptureScript.includes('must not use local, fixture, example, mock or test identifiers')) {
      violations.push(`${liveOpenCaptureScriptPath}: live open connector capture must reject non-beta evidence identity values`);
    }
    if (!redditLiveScript.includes('REDDIT_LIVE_EVIDENCE_PATH')) {
      violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must support redacted evidence artifact output`);
    }
    if (!redditLiveScript.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH')) {
      violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must require credential lifecycle evidence`);
    }
    if (!redditLiveCaptureScript.includes('REDDIT_LIVE_EVIDENCE_ENV_PATH')) {
      violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must write an evidence env handoff`);
    }
    for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath', 'REDDIT_LIVE_EVIDENCE_PATH', 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', 'SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
      if (!redditLiveCaptureScript.includes(marker)) {
        violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth env handoff must include ${marker}`);
      }
    }
    if (!redditLiveCaptureScript.includes('intentionally does not export secret values')) {
      violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth env handoff must document that OAuth credentials stay out of the handoff`);
    }
    for (const marker of [
      "grant_type: 'refresh_token'",
      'REDDIT_REFRESH_TOKEN',
      'requiredFirstEnv',
      "'REDDIT_CLIENT_ID', 'REDDIT_APP_CLIENT_ID'",
      "'REDDIT_CLIENT_SECRET', 'REDDIT_APP_CLIENT_SECRET'",
    ]) {
      if (!redditLiveCaptureScript.includes(marker)) {
        violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must support permanent refresh-token credentials through ${marker}`);
      }
    }
    if (!redditLiveCaptureScript.includes('must not use local, fixture, example, mock or test identifiers')) {
      violations.push(`${redditLiveCaptureScriptPath}: live Reddit OAuth capture must reject non-beta evidence identity values`);
    }
    for (const marker of [
      "duration: 'permanent'",
      'refresh_token',
      'REDDIT_REFRESH_TOKEN',
      'This file stores the permanent refresh token, not a short-lived access token.',
      'did not return refresh_token',
    ]) {
      if (!redditOAuthLocalCallbackScript.includes(marker)) {
        violations.push(`${redditOAuthLocalCallbackScriptPath}: local callback helper must create permanent Reddit refresh-token credentials through ${marker}`);
      }
    }
    if (redditOAuthLocalCallbackScript.includes("['REDDIT_ACCESS_TOKEN', credential")) {
      violations.push(`${redditOAuthLocalCallbackScriptPath}: local callback helper must not persist short-lived REDDIT_ACCESS_TOKEN in the secret env`);
    }
    for (const marker of [
      'refreshTokenProvider',
      'context.config?.refreshToken',
      'context.config?.redditRefreshToken',
      'context.config?.clientId',
      'context.config?.redditClientId',
      'Reddit refresh-token OAuth provider is not configured',
    ]) {
      if (!redditSourceProviderScript.includes(marker)) {
        violations.push(`${redditSourceProviderPath}: runtime Reddit provider must support tenant refresh-token credentials through ${marker}`);
      }
    }
    for (const marker of [
      'grant_type: \'refresh_token\'',
      'refresh_token: request.refreshToken',
      'cacheKeyFor',
      'createHash',
      'redactedBodyPreview',
      'RedditRefreshTokenProviderPort',
    ]) {
      if (!redditRefreshTokenProviderScript.includes(marker)) {
        violations.push(`${redditRefreshTokenProviderPath}: Reddit refresh-token provider must implement safe token exchange through ${marker}`);
      }
    }
    for (const marker of [
      'fail_closed_without_reddit_oauth_credential',
      'REDDIT_REFRESH_TOKEN',
      'RedditRefreshTokenProvider.fromEnvironment',
      'credentialMode: \'refresh_token\'',
      'REDDIT_CLIENT_ID/REDDIT_APP_CLIENT_ID',
    ]) {
      if (!redditLiveScript.includes(marker)) {
        violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must support durable refresh-token credentials through ${marker}`);
      }
    }
    if (/SKIPPED:\s*REDDIT_ACCESS_TOKEN is not set/i.test(redditLiveScript)) {
      violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must not skip missing REDDIT_ACCESS_TOKEN`);
    }
    if (!liveOpenScript.includes(liveArtifactFormat)) {
      violations.push(`${liveOpenScriptPath}: live open connector smoke must emit ${liveArtifactFormat}`);
    }
    if (!redditLiveScript.includes(liveArtifactFormat)) {
      violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must emit ${liveArtifactFormat}`);
    }
    if (!githubRepoRadarPrismaLiveE2eScript.includes('GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH')) {
      violations.push(`${githubRepoRadarPrismaLiveE2eScriptPath}: GitHub repo radar Prisma live e2e must support redacted evidence artifact output`);
    }
    if (!githubRepoRadarPrismaLiveE2eScript.includes(liveArtifactFormat)) {
      violations.push(`${githubRepoRadarPrismaLiveE2eScriptPath}: GitHub repo radar Prisma live e2e must emit ${liveArtifactFormat}`);
    }
    if (!githubTrendingPageLiveScript.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH')) {
      violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live smoke must support redacted evidence artifact output`);
    }
    if (!githubTrendingPageCaptureScript.includes('GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_ENV_PATH')) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: GitHub Trending Page capture must write an evidence env handoff`);
    }
    for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceEnvFilePath', 'validateEvidenceJsonFilePath', 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH', 'SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'BACKEND_GIT_COMMIT_SHA', 'SOURCE_LIVE_OPERATOR']) {
      if (!githubTrendingPageCaptureScript.includes(marker)) {
        violations.push(`${githubTrendingPageCaptureScriptPath}: GitHub Trending Page env handoff must include ${marker}`);
      }
    }
    if (!githubTrendingPageCaptureScript.includes('intentionally does not export credentials')) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: GitHub Trending Page env handoff must document that credentials stay out of the handoff`);
    }
    if (!githubTrendingPageCaptureScript.includes('must not use local, fixture, example, mock or test identifiers')) {
      violations.push(`${githubTrendingPageCaptureScriptPath}: GitHub Trending Page capture must reject non-beta evidence identity values`);
    }
    if (!githubTrendingPageLiveScript.includes(liveArtifactFormat)) {
      violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live smoke must emit ${liveArtifactFormat}`);
    }
    for (const marker of [
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ]) {
      if (!githubTrendingPageLiveScript.includes(marker)) {
        violations.push(`${githubTrendingPageLiveScriptPath}: GitHub Trending Page live evidence output must include ${marker}`);
      }
    }
    for (const [scriptPath, scriptSource] of [
      [liveOpenScriptPath, liveOpenScript],
      [redditLiveScriptPath, redditLiveScript],
      [githubRepoRadarPrismaLiveE2eScriptPath, githubRepoRadarPrismaLiveE2eScript],
      [githubTrendingPageLiveScriptPath, githubTrendingPageLiveScript],
    ]) {
      if (!scriptSource.includes('writeLiveEvidenceArtifactAtomically')) {
        violations.push(`${scriptPath}: live smoke script must use the shared private evidence artifact writer`);
      }
    }
    for (const marker of [
      'writeLiveEvidenceArtifactAtomically',
      'validateLiveEvidenceJsonFilePath',
      'readLiveEvidenceArtifactFile',
      'renameSync',
      'temporaryEvidencePath',
      'mode: 0o600',
      'chmodSync',
      '0600-style private file permissions',
      'must not write release evidence into the git workspace',
      'must not point to fixture or example paths',
    ]) {
      if (!liveEvidenceArtifactHelper.includes(marker)) {
        violations.push(`${liveEvidenceArtifactHelperPath}: live evidence artifact helper must include ${marker}`);
      }
    }
    for (const [scriptPath, scriptSource] of [
      [liveOpenCaptureScriptPath, liveOpenCaptureScript],
      [githubTrendingPageCaptureScriptPath, githubTrendingPageCaptureScript],
      [redditLiveCaptureScriptPath, redditLiveCaptureScript],
    ]) {
      for (const marker of ['writeEvidenceEnvFile', 'validateEvidenceJsonFilePath']) {
        if (!scriptSource.includes(marker)) {
          violations.push(`${scriptPath}: live evidence capture script must include ${marker}`);
        }
      }
    }
  }

  function requireScriptSignals(scriptPath, scriptSource, signalIds) {
    for (const signalId of signalIds) {
      if (!scriptSource.includes(signalId)) {
        violations.push(`${scriptPath}: live smoke script must cover signalId "${signalId}"`);
      }
    }
  }

  return { validateLiveSmokeScriptContracts };
}
