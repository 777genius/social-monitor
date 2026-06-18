import { existsSync, readFileSync } from 'node:fs';

const evidencePath = 'ops/ingestion/source-live-certification-evidence.json';
const sourceCertificationPath = 'ops/ingestion/source-provider-certification.json';
const packagePath = 'package.json';
const backendSafePath = 'ops/release/backend-safe-verify-contract.json';
const releaseContractPath = 'ops/release/mvp-release-evidence-contract.json';
const backendOpsPath = 'ops/release/backend-ops-readiness-contract.json';
const externalReadinessPath = 'ops/release/external-beta-readiness-contract.json';
const baselinePath = 'ops/release/release-baseline-contract.json';
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
  'reddit_access_token',
  'github_token',
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
validateLiveSmokeFailClosed();
validateLiveProviderEvidence();
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

function validateLiveSmokeFailClosed() {
  const redditLiveScript = readFileSync(redditLiveScriptPath, 'utf8');
  if (!redditLiveScript.includes('fail_closed_without_reddit_access_token')) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must fail closed when REDDIT_ACCESS_TOKEN is missing`);
  }
  if (/SKIPPED:\s*REDDIT_ACCESS_TOKEN is not set/i.test(redditLiveScript)) {
    violations.push(`${redditLiveScriptPath}: live Reddit OAuth smoke must not skip missing REDDIT_ACCESS_TOKEN`);
  }
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
}
