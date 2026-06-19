import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import {
  validateEvidenceArtifactProvenance,
  validateEvidenceProvenanceRequirements,
} from './lib/evidence-provenance.mjs';

const evidencePath = 'ops/ingestion/source-live-certification-evidence.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
const liveOpenScriptPath = 'scripts/check-live-open-connectors.ts';
const redditLiveScriptPath = 'scripts/check-live-reddit-oauth.ts';

const evidence = readJson(evidencePath);
const sourceCertification = readJson(sourceCertificationPath);
const packageJson = readJson(packagePath);
const backendSafe = readJson(backendSafePath);
const releaseContract = readJson(releaseContractPath);
const backendOps = readJson(backendOpsPath);
const externalReadiness = readJson(externalReadinessPath);
const baseline = readJson(baselinePath);
const scripts = packageJson.scripts ?? {};
const violations = [];

const gateScript = 'check:source-live-certification-evidence';
const gateCommand = `npm run ${gateScript}`;
const gateId = 'source-live-certification-evidence';
const liveStatusValues = new Set(['pending_live_evidence', 'passed']);
const liveArtifactFormat = 'source-live-provider-evidence-v1';
const liveArtifactEvidenceKind = 'live_network';
const requiredProviderSignals = new Map([
  ['hacker-news', new Set(['hn-live-http-smoke', 'hn-rate-limit-evidence'])],
  ['rss', new Set(['rss-allowlisted-live-feeds', 'rss-http-cache-evidence', 'rss-ssrf-proof'])],
  ['github', new Set(['github-live-api-smoke', 'github-rate-limit-budget'])],
  [
    'reddit',
    new Set([
      'reddit-tenant-oauth-smoke',
      'reddit-auth-failure',
      'reddit-rate-limit-budget',
      'reddit-credential-lifecycle',
    ]),
  ],
]);
const requiredEvidenceShapeBySignalId = new Map([
  [
    'hn-live-http-smoke',
    [
      ['summary', 'non_empty_string'],
      ['listingStoryCount', 'positive_integer'],
      ['searchStoryCount', 'positive_integer'],
      ['stableNumericIds', 'boolean_true'],
      ['normalizedIdsSampled', 'boolean_true'],
    ],
  ],
  [
    'hn-rate-limit-evidence',
    [
      ['summary', 'non_empty_string'],
      ['timeoutMs', 'positive_integer'],
      ['maxListingStories', 'positive_integer'],
      ['maxSearchStories', 'positive_integer'],
      ['degradationSignalRecorded', 'boolean_true'],
    ],
  ],
  [
    'rss-allowlisted-live-feeds',
    [
      ['summary', 'non_empty_string'],
      ['feedCount', 'positive_integer'],
      ['itemCount', 'positive_integer'],
      ['allowlistMatched', 'boolean_true'],
      ['normalizedItemsObserved', 'boolean_true'],
    ],
  ],
  [
    'rss-http-cache-evidence',
    [
      ['summary', 'non_empty_string'],
      ['cacheValidatorFeedCount', 'positive_integer'],
      ['validatorsObserved', 'non_empty_string_array'],
      ['conditionalReadObserved', 'boolean_true'],
    ],
  ],
  [
    'rss-ssrf-proof',
    [
      ['summary', 'non_empty_string'],
      ['rejectedProbeCount', 'positive_integer'],
      ['blockedTargetClasses', 'non_empty_string_array'],
      ['rejectedBeforeFetch', 'boolean_true'],
    ],
  ],
  [
    'github-live-api-smoke',
    [
      ['summary', 'non_empty_string'],
      ['issueCount', 'positive_integer'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['pullRequestsExcluded', 'boolean_true'],
      ['authMode', 'non_empty_string'],
    ],
  ],
  [
    'github-rate-limit-budget',
    [
      ['summary', 'non_empty_string'],
      ['coreRemaining', 'non_negative_integer'],
      ['searchRemaining', 'non_negative_integer'],
      ['budgetObserved', 'boolean_true'],
    ],
  ],
  [
    'reddit-tenant-oauth-smoke',
    [
      ['summary', 'non_empty_string'],
      ['subreddit', 'non_empty_string'],
      ['listing', 'non_empty_string'],
      ['itemCount', 'positive_integer'],
      ['canonicalUrlsObserved', 'boolean_true'],
      ['warningCount', 'non_negative_integer'],
    ],
  ],
  [
    'reddit-auth-failure',
    [
      ['summary', 'non_empty_string'],
      ['status', 'non_empty_string'],
      ['failedClosed', 'boolean_true'],
    ],
  ],
  [
    'reddit-rate-limit-budget',
    [
      ['summary', 'non_empty_string'],
      ['headersObserved', 'boolean_true'],
      ['observedHeaderNames', 'non_empty_string_array'],
    ],
  ],
  [
    'reddit-credential-lifecycle',
    [
      ['summary', 'non_empty_string'],
      ['lifecycleArtifactSha256', 'sha256_hex'],
      ['redactionChecked', 'boolean_true'],
      ['lifecycleOperations', 'non_empty_string_array'],
    ],
  ],
]);
const requiredDeferredProviders = new Set(['telegram', 'x-twitter']);
const expectedLiveCommands = new Map([
  ['hacker-news', 'npm run check:live-open-connectors'],
  ['rss', 'npm run check:live-open-connectors'],
  ['github', 'npm run check:live-open-connectors'],
  ['reddit', 'npm run check:live-reddit-oauth'],
]);
const forbiddenEvidenceFragments = [
  'bearer ',
  'basic ',
  '://user:',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'reddit_access_token',
  'github_token',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'smk_',
  'whsec_',
];

if (evidence.schemaVersion !== 1) {
  violations.push(`${evidencePath}: schemaVersion must be 1`);
}

if (evidence.scope !== 'backend-only') {
  violations.push(`${evidencePath}: scope must be backend-only`);
}

if (evidence.frontendPolicy !== 'deferred_contract_only') {
  violations.push(`${evidencePath}: frontendPolicy must keep frontend deferred`);
}

if (!['hold_until_live_provider_evidence', 'passed'].includes(evidence.externalBetaStatus)) {
  violations.push(`${evidencePath}: externalBetaStatus must hold until live provider evidence or be passed`);
}

if (evidence.sourceCertification !== sourceCertificationPath) {
  violations.push(`${evidencePath}: sourceCertification must reference ${sourceCertificationPath}`);
}

validateSourceCertification();
validateLiveSmokeScripts();
validatePassedArtifactContentSchema();
validateSignalEvidenceSchemaMap();
validateLiveProviderEvidence();
validateExampleArtifacts();
validateEnvironmentArtifacts();
validateDeferredProviders();
validateNoSensitiveEvidenceLiterals();
requireWiring();

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Source live certification evidence OK');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

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
  }

  const fakeSource = certified.get('fake-source');
  if (fakeSource !== undefined && fakeSource.liveBetaReady !== false) {
    violations.push(`${sourceCertificationPath}: fake-source must never claim live beta readiness`);
  }
}

function validateLiveSmokeScripts() {
  const liveOpenScript = readFileSync(liveOpenScriptPath, 'utf8');
  const redditLiveScript = readFileSync(redditLiveScriptPath, 'utf8');

  requireScriptSignals(liveOpenScriptPath, liveOpenScript, [
    ...requiredProviderSignals.get('hacker-news'),
    ...requiredProviderSignals.get('rss'),
    ...requiredProviderSignals.get('github'),
  ]);
  requireScriptSignals(redditLiveScriptPath, redditLiveScript, [...requiredProviderSignals.get('reddit')]);

  if (!liveOpenScript.includes('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH')) {
    violations.push(`${liveOpenScriptPath}: live open connector smoke must support redacted evidence artifact output`);
  }
  if (!redditLiveScript.includes('REDDIT_LIVE_EVIDENCE_PATH')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must support redacted evidence artifact output`);
  }
  if (!redditLiveScript.includes('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must require credential lifecycle evidence`);
  }
  if (!redditLiveScript.includes('fail_closed_without_reddit_access_token')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must fail closed when REDDIT_ACCESS_TOKEN is missing`);
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
}

function requireScriptSignals(scriptPath, scriptSource, signalIds) {
  for (const signalId of signalIds) {
    if (!scriptSource.includes(signalId)) {
      violations.push(`${scriptPath}: live smoke script must cover signalId "${signalId}"`);
    }
  }
}

function validatePassedArtifactContentSchema() {
  const schema = evidence.passedArtifactContentSchema;
  if (typeof schema !== 'object' || schema === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema is required`);
    return;
  }

  if (schema.schemaVersion !== 1) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.schemaVersion must be 1`);
  }
  if (schema.format !== liveArtifactFormat) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.format must be ${liveArtifactFormat}`);
  }
  requireExistingPath(schema.exampleArtifactPath, 'passedArtifactContentSchema.exampleArtifactPath');

  const requiredTopLevelFields = new Set(schema.requiredTopLevelFields ?? []);
  for (const field of [
    'schemaVersion',
    'format',
    'artifactId',
    'environmentId',
    'imageDigest',
    'operator',
    'sampledAt',
    'provenance',
    'redaction',
    'providerResults',
  ]) {
    if (!requiredTopLevelFields.has(field)) {
      violations.push(`${evidencePath}: passedArtifactContentSchema.requiredTopLevelFields must include ${field}`);
    }
  }

  const redaction = schema.redactionRequirements;
  if (typeof redaction !== 'object' || redaction === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements is required`);
  } else {
    for (const field of [
      'secretsIncluded',
      'rawProviderPayloadsIncluded',
      'credentialValuesIncluded',
      'privateNetworkUrlsIncluded',
    ]) {
      if (redaction[field] !== false) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.redactionRequirements.${field} must be false`);
      }
    }
  }

  const signalResult = schema.signalResultRequirements;
  if (typeof signalResult !== 'object' || signalResult === null) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements is required`);
  } else {
    if (signalResult.status !== 'passed') {
      violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.status must be passed`);
    }
    for (const field of ['signalId', 'status', 'observedAt', 'evidence']) {
      if (!signalResult.requiredFields?.includes(field)) {
        violations.push(`${evidencePath}: passedArtifactContentSchema.signalResultRequirements.requiredFields must include ${field}`);
      }
    }
  }

  validateProvenanceRequirements(schema.provenanceRequirements);
  validateEnvArtifactValidation(schema.envArtifactValidation);
}

function validateProvenanceRequirements(requirements) {
  validateEvidenceProvenanceRequirements({
    requirements,
    expectedEvidenceKind: liveArtifactEvidenceKind,
    label: 'passedArtifactContentSchema.provenanceRequirements',
    sourcePath: evidencePath,
    violations,
  });
}

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
    for (const field of ['stagingArtifactPath', 'environmentId', 'imageDigest', 'sampledAt']) {
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

function validatePassedProviderArtifact(provider) {
  if (typeof provider.stagingArtifactPath !== 'string' || !existsSync(provider.stagingArtifactPath)) {
    return;
  }

  const artifact = readJson(provider.stagingArtifactPath);
  validateLiveProviderArtifact(artifact, {
    label: `provider "${provider.providerKey}" stagingArtifactPath`,
    expectedEnvironmentId: provider.environmentId,
    expectedImageDigest: provider.imageDigest,
    expectedSampledAt: provider.sampledAt,
    requiredProviders: new Set([provider.providerKey]),
  });
}

function validateExampleArtifacts() {
  const examplePath = evidence.passedArtifactContentSchema?.exampleArtifactPath;
  if (typeof examplePath !== 'string' || !existsSync(examplePath)) {
    return;
  }

  const examples = readJson(examplePath).examples;
  if (!Array.isArray(examples) || examples.length === 0) {
    violations.push(`${examplePath}: examples must be a non-empty array`);
    return;
  }

  const coveredProviders = new Set();
  for (const example of examples) {
    validateLiveProviderArtifact(example, {
      label: `${examplePath}: example "${example.artifactId ?? '<missing>'}"`,
      requiredProviders: undefined,
      allowFixture: true,
    });

    for (const providerResult of example.providerResults ?? []) {
      coveredProviders.add(providerResult.providerKey);
    }
  }

  for (const providerKey of requiredProviderSignals.keys()) {
    if (!coveredProviders.has(providerKey)) {
      violations.push(`${examplePath}: examples must include provider "${providerKey}"`);
    }
  }
}

function validateEnvironmentArtifacts() {
  validateLiveEvidenceEnvArtifact('LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github']));
  validateLiveEvidenceEnvArtifact('REDDIT_LIVE_EVIDENCE_PATH', new Set(['reddit']));
  validateRedditCredentialLifecycleEnvArtifact();
}

function validateLiveEvidenceEnvArtifact(envVar, requiredProviders) {
  const artifactPath = readOptionalEnv(envVar);
  if (artifactPath === undefined) {
    return;
  }
  if (!existsSync(artifactPath)) {
    violations.push(`${envVar}: must reference an existing ${liveArtifactFormat} artifact`);
    return;
  }

  const expectedEnvironmentId = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_ENVIRONMENT_ID');
  const expectedImageDigest = requireEnvWhenArtifactIsPresent(envVar, 'BACKEND_IMAGE_DIGEST');
  const expectedOperator = requireEnvWhenArtifactIsPresent(envVar, 'SOURCE_LIVE_OPERATOR');
  const artifact = readJson(artifactPath);
  validateLiveProviderArtifact(artifact, {
    label: `${envVar} (${artifactPath})`,
    expectedEnvironmentId,
    expectedImageDigest,
    expectedOperator,
    requiredProviders,
  });
}

function validateRedditCredentialLifecycleEnvArtifact() {
  const lifecyclePath = readOptionalEnv('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH');
  if (lifecyclePath === undefined) {
    return;
  }
  if (!existsSync(lifecyclePath)) {
    violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: must reference an existing redacted lifecycle evidence file');
    return;
  }

  const serialized = readFileSync(lifecyclePath, 'utf8');
  const lower = serialized.toLowerCase();
  for (const fragment of forbiddenEvidenceFragments) {
    if (lower.includes(fragment)) {
      violations.push(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must not contain "${fragment}"`);
    }
  }
  for (const marker of ['create', 'rotate', 'revoke', 'redacted']) {
    if (!lower.includes(marker)) {
      violations.push(`REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: lifecycle artifact must include ${marker} evidence`);
    }
  }

  const lifecycleSha256 = createHash('sha256').update(serialized).digest('hex');
  const redditLivePath = readOptionalEnv('REDDIT_LIVE_EVIDENCE_PATH');
  if (redditLivePath !== undefined && existsSync(redditLivePath)) {
    const redditArtifact = readJson(redditLivePath);
    const lifecycleSignal = findSignalResult(redditArtifact, 'reddit', 'reddit-credential-lifecycle');
    if (lifecycleSignal?.evidence?.lifecycleArtifactSha256 !== lifecycleSha256) {
      violations.push('REDDIT_CREDENTIAL_LIFECYCLE_EVIDENCE_PATH: sha256 must match reddit live evidence lifecycle signal');
    }
  }
}

function findSignalResult(artifact, providerKey, signalId) {
  const provider = (artifact.providerResults ?? []).find((result) => result.providerKey === providerKey);
  return provider?.signalResults?.find((signal) => signal.signalId === signalId);
}

function requireEnvWhenArtifactIsPresent(artifactEnvVar, requiredEnvVar) {
  const value = readOptionalEnv(requiredEnvVar);
  if (value === undefined) {
    violations.push(`${artifactEnvVar}: requires ${requiredEnvVar}`);
  }

  return value;
}

function readOptionalEnv(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function validateLiveProviderArtifact(artifact, options) {
  const label = options.label;

  if (artifact.schemaVersion !== 1) {
    violations.push(`${label}: schemaVersion must be 1`);
  }
  if (artifact.format !== liveArtifactFormat) {
    violations.push(`${label}: format must be ${liveArtifactFormat}`);
  }
  for (const field of ['artifactId', 'environmentId', 'imageDigest', 'operator', 'sampledAt']) {
    if (typeof artifact[field] !== 'string' || artifact[field].trim().length === 0) {
      violations.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(String(artifact.imageDigest ?? ''))) {
    violations.push(`${label}: imageDigest must be immutable sha256 digest`);
  }
  if (options.expectedEnvironmentId !== undefined && artifact.environmentId !== options.expectedEnvironmentId) {
    violations.push(`${label}: environmentId must match liveProviderEvidence entry`);
  }
  if (options.expectedImageDigest !== undefined && artifact.imageDigest !== options.expectedImageDigest) {
    violations.push(`${label}: imageDigest must match liveProviderEvidence entry`);
  }
  if (options.expectedSampledAt !== undefined && artifact.sampledAt !== options.expectedSampledAt) {
    violations.push(`${label}: sampledAt must match liveProviderEvidence entry`);
  }
  if (options.expectedOperator !== undefined && artifact.operator !== options.expectedOperator) {
    violations.push(`${label}: operator must match SOURCE_LIVE_OPERATOR`);
  }

  validateArtifactProvenance(artifact.provenance, label, options);
  validateArtifactRedaction(artifact, label);
  validateNoSensitiveArtifactLiterals(artifact, label);
  validateProviderResults(artifact, options);
}

function validateArtifactProvenance(provenance, label, options) {
  validateEvidenceArtifactProvenance({
    provenance,
    label,
    expectedEvidenceKind: liveArtifactEvidenceKind,
    allowFixture: options.allowFixture === true,
    violations,
    realEvidenceLabel: 'live evidence artifacts',
  });
}

function validateArtifactRedaction(artifact, label) {
  if (typeof artifact.redaction !== 'object' || artifact.redaction === null) {
    violations.push(`${label}: redaction object is required`);
    return;
  }

  for (const field of [
    'secretsIncluded',
    'rawProviderPayloadsIncluded',
    'credentialValuesIncluded',
    'privateNetworkUrlsIncluded',
  ]) {
    if (artifact.redaction[field] !== false) {
      violations.push(`${label}: redaction.${field} must be false`);
    }
  }
}

function validateNoSensitiveArtifactLiterals(artifact, label) {
  const serialized = JSON.stringify(artifact).toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${label}: artifact must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateProviderResults(artifact, options) {
  if (!Array.isArray(artifact.providerResults) || artifact.providerResults.length === 0) {
    violations.push(`${options.label}: providerResults must be a non-empty array`);
    return;
  }

  const providerResults = new Map();
  for (const result of artifact.providerResults) {
    if (providerResults.has(result.providerKey)) {
      violations.push(`${options.label}: duplicate providerResult "${result.providerKey}"`);
      continue;
    }
    providerResults.set(result.providerKey, result);

    if (!requiredProviderSignals.has(result.providerKey)) {
      violations.push(`${options.label}: unsupported providerResult "${result.providerKey}"`);
      continue;
    }
    if (result.status !== 'passed') {
      violations.push(`${options.label}: providerResult "${result.providerKey}" must have status=passed`);
    }
    validateArtifactSignalResults(result, options.label);
  }

  const requiredProviders = options.requiredProviders ?? new Set(providerResults.keys());
  for (const providerKey of requiredProviders) {
    if (!providerResults.has(providerKey)) {
      violations.push(`${options.label}: missing providerResult "${providerKey}"`);
    }
  }
}

function validateArtifactSignalResults(providerResult, label) {
  if (!Array.isArray(providerResult.signalResults) || providerResult.signalResults.length === 0) {
    violations.push(`${label}: providerResult "${providerResult.providerKey}" must define signalResults`);
    return;
  }

  const requiredSignals = requiredProviderSignals.get(providerResult.providerKey) ?? new Set();
  const seenSignals = new Set();
  for (const signal of providerResult.signalResults) {
    if (seenSignals.has(signal.signalId)) {
      violations.push(`${label}: duplicate signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
      continue;
    }
    seenSignals.add(signal.signalId);

    if (!requiredSignals.has(signal.signalId)) {
      violations.push(`${label}: unsupported signalResult "${signal.signalId}" for provider "${providerResult.providerKey}"`);
    }
    if (signal.status !== 'passed') {
      violations.push(`${label}: signalResult "${signal.signalId}" must have status=passed`);
    }
    if (typeof signal.observedAt !== 'string' || signal.observedAt.trim().length === 0) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define observedAt`);
    }
    if (!isRecord(signal.evidence)) {
      violations.push(`${label}: signalResult "${signal.signalId}" must define evidence object`);
    } else {
      validateSignalEvidenceShape(label, signal);
    }
  }

  for (const signalId of requiredSignals) {
    if (!seenSignals.has(signalId)) {
      violations.push(`${label}: provider "${providerResult.providerKey}" missing signalResult "${signalId}"`);
    }
  }
}

function validateDeferredProviders() {
  const deferred = new Map();
  const sourceDeferred = new Map(
    (sourceCertification.deferredProviders ?? []).map((provider) => [provider.providerKey, provider]),
  );

  for (const provider of evidence.deferredProviders ?? []) {
    if (deferred.has(provider.providerKey)) {
      violations.push(`${evidencePath}: duplicate deferred provider "${provider.providerKey}"`);
    }
    deferred.set(provider.providerKey, provider);

    if (!requiredDeferredProviders.has(provider.providerKey)) {
      violations.push(`${evidencePath}: unsupported deferred provider "${provider.providerKey}"`);
    }
    if (provider.status !== 'deferred') {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must have status=deferred`);
    }
    if (provider.requiredForExternalBeta !== false) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must not be required for external beta`);
    }
    if (typeof provider.exitCondition !== 'string' || provider.exitCondition.trim().length === 0) {
      violations.push(`${evidencePath}: deferred provider "${provider.providerKey}" must define exitCondition`);
    }

    const sourceProvider = sourceDeferred.get(provider.providerKey);
    if (sourceProvider === undefined) {
      violations.push(`${sourceCertificationPath}: missing deferred provider "${provider.providerKey}"`);
    } else if (sourceProvider.runtimeReadiness !== 'deferred') {
      violations.push(`${sourceCertificationPath}: deferred provider "${provider.providerKey}" must have runtimeReadiness=deferred`);
    }
  }

  for (const providerKey of requiredDeferredProviders) {
    if (!deferred.has(providerKey)) {
      violations.push(`${evidencePath}: missing deferred provider "${providerKey}"`);
    }
  }
}

function validateNoSensitiveEvidenceLiterals() {
  const serialized = JSON.stringify(evidence).toLowerCase();

  for (const fragment of forbiddenEvidenceFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${evidencePath}: evidence must not contain sensitive literal fragment "${fragment}"`);
    }
  }
}

function validateSignalEvidenceSchemaMap() {
  const requiredSignalIds = new Set([...requiredProviderSignals.values()].flatMap((signals) => [...signals]));

  for (const signalId of requiredSignalIds) {
    const shape = requiredEvidenceShapeBySignalId.get(signalId);
    if (!Array.isArray(shape) || shape.length === 0) {
      violations.push(`${evidencePath}: missing signal-specific evidence schema for "${signalId}"`);
      continue;
    }

    const seenFields = new Set();
    for (const [fieldPath, fieldType] of shape) {
      if (typeof fieldPath !== 'string' || fieldPath.trim().length === 0) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" has an empty field path`);
      }
      if (seenFields.has(fieldPath)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" duplicates field "${fieldPath}"`);
      }
      seenFields.add(fieldPath);
      if (!isSupportedEvidenceType(fieldType)) {
        violations.push(`${evidencePath}: evidence schema for "${signalId}" uses unsupported type "${fieldType}"`);
      }
    }
  }

  for (const signalId of requiredEvidenceShapeBySignalId.keys()) {
    if (!requiredSignalIds.has(signalId)) {
      violations.push(`${evidencePath}: evidence schema references unsupported signal "${signalId}"`);
    }
  }
}

function validateEnvArtifactValidation(validationRules) {
  if (!Array.isArray(validationRules)) {
    violations.push(`${evidencePath}: passedArtifactContentSchema.envArtifactValidation must be an array`);
    return;
  }

  const expectedRules = new Map([
    ['LIVE_OPEN_CONNECTORS_EVIDENCE_PATH', new Set(['hacker-news', 'rss', 'github'])],
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
      continue;
    }

    const expectedProviders = expectedRules.get(rule.envVar);
    if (expectedProviders === undefined) {
      violations.push(`${evidencePath}: ${label}.envVar is unsupported`);
      continue;
    }
    seenRules.add(rule.envVar);
    requireProviderSetCoverage(new Set(rule.requiredProviders ?? []), expectedProviders, label);
    if (rule.format !== liveArtifactFormat) {
      violations.push(`${evidencePath}: ${label}.format must be ${liveArtifactFormat}`);
    }
    for (const envVar of ['SOURCE_LIVE_ENVIRONMENT_ID', 'BACKEND_IMAGE_DIGEST', 'SOURCE_LIVE_OPERATOR']) {
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

function requireProviderSetCoverage(actual, expected, label) {
  for (const providerKey of expected) {
    if (!actual.has(providerKey)) {
      violations.push(`${evidencePath}: ${label}.requiredProviders must include ${providerKey}`);
    }
  }
}

function validateSignalEvidenceShape(label, signal) {
  const shape = requiredEvidenceShapeBySignalId.get(signal.signalId);
  if (shape === undefined) {
    violations.push(`${label}: signalResult "${signal.signalId}" has no evidence schema`);
    return;
  }

  for (const [fieldPath, fieldType] of shape) {
    const value = getPath(signal.evidence, fieldPath);
    if (value === undefined) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence must include ${fieldPath}`);
      continue;
    }
    if (!matchesEvidenceType(value, fieldType)) {
      violations.push(`${label}: signalResult "${signal.signalId}" evidence.${fieldPath} must be ${fieldType}`);
    }
  }
}

function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
}

function matchesEvidenceType(value, fieldType) {
  switch (fieldType) {
    case 'non_empty_string':
      return typeof value === 'string' && value.trim().length > 0;
    case 'positive_integer':
      return Number.isInteger(value) && value > 0;
    case 'non_negative_integer':
      return Number.isInteger(value) && value >= 0;
    case 'boolean_true':
      return value === true;
    case 'non_empty_string_array':
      return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    case 'sha256_hex':
      return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
    default:
      return false;
  }
}

function isSupportedEvidenceType(fieldType) {
  return new Set([
    'non_empty_string',
    'positive_integer',
    'non_negative_integer',
    'boolean_true',
    'non_empty_string_array',
    'sha256_hex',
  ]).has(fieldType);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCommand(command, label) {
  const scriptName = String(command ?? '').replace(/^npm run /, '');
  if (!String(command ?? '').startsWith('npm run ')) {
    violations.push(`${evidencePath}: ${label} must use npm run`);
    return;
  }
  if (!scripts[scriptName]) {
    violations.push(`${evidencePath}: ${label} references missing npm script "${scriptName}"`);
  }
}

function requireExistingPath(path, label) {
  if (typeof path !== 'string' || path.trim().length === 0 || !existsSync(path)) {
    violations.push(`${evidencePath}: ${label} must reference an existing path`);
  }
}

function requireWiring() {
  const backendScripts = new Set(backendSafe.backendScripts ?? []);
  const releaseGateIds = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.gateId));
  const releaseGateCommands = new Set((releaseContract.requiredGates ?? []).map((gate) => gate.command));
  const sourceDomain = (backendOps.requiredDomains ?? []).find((domain) => domain.domainId === 'source-scope');
  const externalGroup = (externalReadiness.requiredEvidenceGroups ?? []).find(
    (group) => group.groupId === 'source-provider-live-certification',
  );
  const baselineScripts = new Set(baseline.requiredGreenScripts ?? []);
  const baselineArtifacts = new Set((baseline.trackedArtifacts ?? []).map((artifact) => artifact.path));

  if (!scripts[gateScript]) {
    violations.push(`${packagePath}: missing ${gateScript}`);
  }
  if (!backendScripts.has(gateScript)) {
    violations.push(`${backendSafePath}: backend-safe verify must include ${gateScript}`);
  }
  if (!releaseGateIds.has(gateId)) {
    violations.push(`${releaseContractPath}: missing ${gateId} release gate`);
  }
  if (!releaseGateCommands.has(gateCommand)) {
    violations.push(`${releaseContractPath}: release gates must include ${gateScript}`);
  }

  if (sourceDomain === undefined) {
    violations.push(`${backendOpsPath}: missing source-scope domain`);
  } else {
    if (!sourceDomain.gates?.includes(gateScript)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateScript}`);
    }
    if (!sourceDomain.releaseGateIds?.includes(gateId)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${gateId}`);
    }
    if (!sourceDomain.artifacts?.includes(evidencePath)) {
      violations.push(`${backendOpsPath}: source-scope domain must include ${evidencePath}`);
    }
  }

  if (externalGroup === undefined) {
    violations.push(`${externalReadinessPath}: missing source-provider-live-certification group`);
  } else {
    if (!externalGroup.verificationCommands?.includes(gateCommand)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${gateScript}`);
    }
    if (!externalGroup.requiredArtifacts?.includes(evidencePath)) {
      violations.push(`${externalReadinessPath}: source-provider-live-certification group must include ${evidencePath}`);
    }
    if (externalGroup.status !== 'blocked_without_live_credentials' && evidence.externalBetaStatus !== 'passed') {
      violations.push(`${externalReadinessPath}: source provider group must stay blocked until live evidence passes`);
    }
  }

  if (!baselineScripts.has(gateScript)) {
    violations.push(`${baselinePath}: requiredGreenScripts must include ${gateScript}`);
  }
  if (!baselineArtifacts.has(evidencePath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include ${evidencePath}`);
  }
  if (!baselineArtifacts.has(evidence.passedArtifactContentSchema?.exampleArtifactPath)) {
    violations.push(`${baselinePath}: trackedArtifacts must include source live certification example artifact path`);
  }
}
