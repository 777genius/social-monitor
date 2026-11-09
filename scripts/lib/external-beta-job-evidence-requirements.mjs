// Canonical declarative evidence requirements. The checker retains I/O and validation ownership.
// Preserve the original required values and order; policies consume these immutable-by-convention tables.
const requiredJobEnvNames = new Map([
  [
    'durable-runtime-staging-proof',
    [
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'API_BASE_URL',
      'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH',
    ],
  ],
  [
    'live-open-connectors',
    [
      'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  [
    'live-reddit-oauth',
    [
      'REDDIT_ACCESS_TOKEN',
      'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH',
      'REDDIT_LIVE_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  ['summary-real-feedback-import', ['SUMMARY_REAL_FEEDBACK_SAMPLES_PATH']],
  [
    'security-final-sweep-staging',
    [
      'SECURITY_FINAL_SWEEP_ARTIFACT_PATH',
      'LOG_EXPORT_PATH',
      'METRICS_EXPORT_PATH',
      'PUBLIC_ERROR_EXPORT_PATH',
      'AUDIT_EVENT_EXPORT_PATH',
    ],
  ],
  [
    'credential-secret-rotation-drill',
    [
      'STAGING_SECRET_STORE_ID',
      'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH',
      'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH',
    ],
  ],
  [
    'rabbitmq-staging-reliability-drill',
    [
      'RABBITMQ_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
    ],
  ],
  [
    'postgres-restore-migration-drill',
    [
      'DATABASE_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
    ],
  ],
  [
    'durable-backend-e2e-loop',
    [
      'API_BASE_URL',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
      'INFINITY_CONTEXT_URL',
      'INFINITY_CONTEXT_TOKEN',
    ],
  ],
  [
    'relevance-memory-runtime-canary',
    [
      'DATABASE_URL',
      'INFINITY_CONTEXT_URL',
      'INFINITY_CONTEXT_TOKEN',
      'RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
      'RELEVANCE_MEMORY_RUNTIME_CANARY_PERSISTENCE',
    ],
  ],
  [
    'release-deploy-smoke',
    [
      'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH',
      'STAGING_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'API_BASE_URL',
    ],
  ],
  [
    'live-github-repo-radar',
    [
      'GITHUB_REPO_RADAR_PRISMA_LIVE_E2E',
      'GITHUB_REPO_RADAR_BIGQUERY_PROJECT_ID',
      'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
      'DATABASE_URL',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
  [
    'live-github-trending-page',
    [
      'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
      'SOURCE_LIVE_ENVIRONMENT_ID',
      'BACKEND_IMAGE_DIGEST',
      'BACKEND_GIT_COMMIT_SHA',
      'SOURCE_LIVE_OPERATOR',
    ],
  ],
]);
const requiredJobOptionalEnvNames = new Map([
  ['live-open-connectors', ['GITHUB_ACCESS_TOKEN']],
  ['live-github-repo-radar', ['GITHUB_ACCESS_TOKEN']],
  ['live-github-trending-page', ['GITHUB_TRENDING_PAGE_USER_AGENT']],
  [
    'live-reddit-oauth',
    [
      'REDDIT_APP_CLIENT_ID',
      'REDDIT_APP_CLIENT_SECRET',
      'REDDIT_CLIENT_ID',
      'REDDIT_CLIENT_SECRET',
      'REDDIT_REFRESH_TOKEN',
      'REDDIT_USER_AGENT',
      'REDDIT_SUBREDDIT',
      'REDDIT_LISTING',
    ],
  ],
  [
    'summary-real-feedback-import',
    [
      'SUMMARY_FEEDBACK_TRIAGE_OWNER',
      'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH',
      'SUMMARY_FEEDBACK_EXPORT_ENV_PATH',
      'SUMMARY_FEEDBACK_TENANT_ID',
      'SUMMARY_FEEDBACK_WORKSPACE_ID',
      'SUMMARY_FEEDBACK_WINDOW_STARTED_AT',
      'SUMMARY_FEEDBACK_WINDOW_ENDED_AT',
      'SUMMARY_FEEDBACK_EXPORT_LIMIT',
      'SUMMARY_FEEDBACK_MIN_SAMPLES',
      'SUMMARY_FEEDBACK_SOURCE_KIND',
      'SUMMARY_FEEDBACK_ENVIRONMENT_ID',
      'SUMMARY_FEEDBACK_OPERATOR',
      'SUMMARY_FEEDBACK_COLLECTION_METHOD',
      'SUMMARY_FEEDBACK_REDACTED_BY',
      'SUMMARY_FEEDBACK_APPROVED_BY',
      'SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM',
      'SUMMARY_FEEDBACK_EXPORT_ID',
      'SUMMARY_FEEDBACK_EXPORTED_AT',
      'SUMMARY_FEEDBACK_REVIEW_QUEUE',
      'SUMMARY_FEEDBACK_REDACTION_REVIEW_ID',
      'SUMMARY_FEEDBACK_APPROVAL_REFERENCE',
    ],
  ],
]);
const requiredJobEnvAlternatives = new Map([
  ['durable-runtime-staging-proof', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL'],
    },
  ]],
  ['live-reddit-oauth', [
    {
      label: 'reddit_access_token',
      env: ['REDDIT_ACCESS_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_refresh_token_flow',
      env: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_app_refresh_token_flow',
      env: ['REDDIT_APP_CLIENT_ID', 'REDDIT_APP_CLIENT_SECRET', 'REDDIT_REFRESH_TOKEN'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'live_command_credential',
    },
    {
      label: 'reddit_captured_live_artifacts',
      env: ['REDDIT_LIVE_EVIDENCE_PATH', 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH'],
      coversEnv: ['REDDIT_ACCESS_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['live-github-repo-radar', [
    {
      label: 'github_repo_radar_captured_live_artifact',
      env: ['GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH'],
      coversEnv: ['DATABASE_URL'],
      mode: 'captured_artifact',
    },
  ]],
  ['rabbitmq-staging-reliability-drill', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['RABBITMQ_URL'],
    },
  ]],
  ['postgres-restore-migration-drill', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['DATABASE_URL'],
    },
  ]],
  ['durable-backend-e2e-loop', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL', 'INFINITY_CONTEXT_URL', 'INFINITY_CONTEXT_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['relevance-memory-runtime-canary', [
    {
      label: 'relevance_memory_captured_canary_artifact',
      env: ['RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH'],
      coversEnv: ['DATABASE_URL', 'INFINITY_CONTEXT_URL', 'INFINITY_CONTEXT_TOKEN'],
      mode: 'captured_artifact',
    },
  ]],
  ['release-deploy-smoke', [
    {
      label: 'docker_backend_staging_bundle',
      env: ['BACKEND_STAGING_EVIDENCE_BUNDLE_PATH'],
      coversEnv: ['API_BASE_URL'],
    },
  ]],
]);
const requiredJobOutputArtifacts = new Map([
  [
    'durable-runtime-staging-proof',
    [
      { kind: 'path', ref: 'ops/release/durable-runtime-proof.json', format: 'durable-runtime-proof-contract-v1' },
      { kind: 'env', ref: 'DURABLE_RUNTIME_SELECTOR_ARTIFACT_PATH', format: 'durable-runtime-selector-artifact-v1' },
    ],
  ],
  [
    'live-open-connectors',
    [
      {
        kind: 'env',
        ref: 'LIVE_OPEN_CONNECTORS_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'live-open-connectors-evidence-v1',
        expectedProviderKeys: ['hacker-news', 'rss', 'github-issues'],
      },
    ],
  ],
  [
    'live-github-repo-radar',
    [
      {
        kind: 'env',
        ref: 'GITHUB_REPO_RADAR_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'github-repo-radar-live-evidence-v1',
        expectedProviderKeys: ['github-repo-radar'],
      },
    ],
  ],
  [
    'live-github-trending-page',
    [
      {
        kind: 'env',
        ref: 'GITHUB_TRENDING_PAGE_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'github-trending-page-live-evidence-v1',
        expectedProviderKeys: ['github-trending-page'],
      },
    ],
  ],
  [
    'live-reddit-oauth',
    [
      {
        kind: 'env',
        ref: 'REDDIT_LIVE_EVIDENCE_PATH',
        format: 'source-live-provider-evidence-v1',
        expectedArtifactId: 'live-reddit-oauth-evidence-v1',
        expectedProviderKeys: ['reddit'],
      },
      { kind: 'env', ref: 'REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH', format: 'reddit-credential-lifecycle-redacted-v1' },
    ],
  ],
  [
    'summary-real-feedback-import',
    [
      { kind: 'env', ref: 'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH', format: 'redacted-summary-feedback-samples-v1' },
    ],
  ],
  [
    'security-final-sweep-staging',
    [
      { kind: 'env', ref: 'SECURITY_FINAL_SWEEP_ARTIFACT_PATH', format: 'security-final-sweep-staging-artifact-v1' },
    ],
  ],
  [
    'credential-secret-rotation-drill',
    [
      { kind: 'path', ref: 'ops/security/credential-secret-runtime-flow.json', format: 'credential-secret-runtime-flow-v1' },
      { kind: 'env', ref: 'SOURCE_CREDENTIAL_ROTATION_EVIDENCE_PATH', format: 'source-credential-rotation-redacted-v1' },
      { kind: 'env', ref: 'WEBHOOK_SECRET_ROTATION_EVIDENCE_PATH', format: 'webhook-secret-rotation-redacted-v1' },
    ],
  ],
  [
    'rabbitmq-staging-reliability-drill',
    [
      {
        kind: 'env',
        ref: 'RABBITMQ_STAGING_DRILL_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'rabbitmq-staging-drill-output',
      },
    ],
  ],
  [
    'postgres-restore-migration-drill',
    [
      {
        kind: 'env',
        ref: 'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'postgres-restore-drill-output',
      },
    ],
  ],
  [
    'durable-backend-e2e-loop',
    [
      {
        kind: 'env',
        ref: 'DURABLE_BACKEND_E2E_ARTIFACT_PATH',
        format: 'staging-reliability-artifact-v1',
        expectedArtifactId: 'durable-backend-e2e-output',
      },
    ],
  ],
  [
    'relevance-memory-runtime-canary',
    [
      {
        kind: 'env',
        ref: 'RELEVANCE_MEMORY_RUNTIME_CANARY_EVIDENCE_PATH',
        format: 'relevance-memory-runtime-canary-v1',
        expectedArtifactId: 'relevance-memory-runtime-canary-v1',
      },
    ],
  ],
  [
    'release-deploy-smoke',
    [
      { kind: 'env', ref: 'RELEASE_DEPLOY_SMOKE_ARTIFACT_PATH', format: 'release-deploy-smoke-artifact-v1' },
    ],
  ],
]);
const requiredSourceLiveCertificationJobIds = [
  'live-open-connectors',
  'live-github-repo-radar',
  'live-github-trending-page',
  'live-reddit-oauth',
];

export {
  requiredJobEnvNames,
  requiredJobOptionalEnvNames,
  requiredJobEnvAlternatives,
  requiredJobOutputArtifacts,
  requiredSourceLiveCertificationJobIds,
};
