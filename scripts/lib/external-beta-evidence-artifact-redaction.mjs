// Pure security and provenance guards for external-beta artifact validation.
const forbiddenArtifactValueFragments = [
  'bearer ',
  'basic ',
  'private_key',
  'client_secret=',
  'postgres://',
  'postgresql://',
  'amqp://',
  'amqps://',
  'redis://',
  'rediss://',
  'mysql://',
  'mongodb://',
  'mongodb+srv://',
  'github_pat_',
  'ghp_',
  'glpat-',
  'xoxb-',
  'xoxp-',
  'xapp-',
  'akia',
  'aws_access_key_id',
  'aws_secret_access_key',
  'sk-proj-',
  'sk-live-',
  'smk_',
  'whsec_',
];
const forbiddenArtifactValuePatterns = [
  {
    label: 'query credential',
    regex: /\b(?:access_token|refresh_token|id_token|api_key|apikey|client_secret|signature|sig)=([^&\s"']+)/gi,
  },
  {
    label: 'header credential',
    regex: /\b(?:authorization|x-api-key|x-amz-security-token):\s*([^,\s"'}]+)/gi,
  },
  {
    label: 'jwt credential',
    regex: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
];
const forbiddenRealArtifactMarkerPattern = /(?:^|[-_:.\s])(example|fixture|synthetic|mock|test)(?:$|[-_:.\s])/i;
const realArtifactMarkerGuardFormats = new Set([
  'durable-runtime-selector-artifact-v1',
  'staging-reliability-artifact-v1',
  'source-credential-rotation-redacted-v1',
  'webhook-secret-rotation-redacted-v1',
  'relevance-memory-runtime-canary-v1',
  'security-final-sweep-staging-artifact-v1',
  'source-live-provider-evidence-v1',
  'reddit-credential-lifecycle-redacted-v1',
  'release-deploy-smoke-artifact-v1',
]);
const forbiddenArtifactKeyNames = new Set([
  'authorization',
  'bearer',
  'token',
  'secret',
  'password',
  'apikey',
  'apitoken',
  'idtoken',
  'jwttoken',
  'sessiontoken',
  'accesstoken',
  'refreshtoken',
  'clientsecret',
  'credentialvalue',
  'secretvalue',
  'signingsecret',
  'privatekey',
  'secretkey',
  'redditaccesstoken',
  'databaseurl',
  'rabbitmqurl',
]);
const forbiddenArtifactKeyPatterns = [
  /(?:raw|plain|plaintext|cleartext).*(?:token|secret|password|credential|apikey|clientsecret|privatekey|signingsecret)/,
  /(?:token|secret|password|credential|apikey|clientsecret|privatekey|signingsecret).*(?:raw|plain|plaintext|cleartext|value)$/,
  /(?:access|refresh|id|jwt|session)token(?:raw|plain|plaintext|cleartext|value)$/,
];
export function validateArtifactLiteralRedaction(content, jobId, label, violations) {
  const serialized = content.toLowerCase();
  for (const fragment of forbiddenArtifactValueFragments) {
    if (serialized.includes(fragment)) {
      violations.push(`${jobId}: ${label} must not contain sensitive literal fragment "${fragment}"`);
    }
  }
  for (const pattern of forbiddenArtifactValuePatterns) {
    pattern.regex.lastIndex = 0;
    for (const match of content.matchAll(pattern.regex)) {
      const sensitiveValue = match[1] ?? match[0];
      if (!isRedactedArtifactValue(sensitiveValue)) {
        violations.push(`${jobId}: ${label} must not contain sensitive literal pattern "${pattern.label}"`);
      }
    }
  }
}

// Scan JSON's decoded values as well as the raw bytes, retaining one diagnostic per rule.
export function validateArtifactDecodedRedaction(content, jobId, label, violations) {
  const decodedViolations = [];
  validateArtifactLiteralRedaction(JSON.stringify(content), jobId, label, decodedViolations);
  for (const message of decodedViolations) {
    if (!violations.includes(message)) {
      violations.push(message);
    }
  }
  validateArtifactStructuredRedaction(content, jobId, label, violations);
}

export function validateArtifactStructuredRedaction(content, jobId, label, violations) {
  if (containsFixtureProvenance(content)) {
    violations.push(`${jobId}: ${label} must not contain fixture provenance`);
  }

  if (requiresRealArtifactMarkerGuard(content)) {
    for (const finding of fixtureMarkerFindings(content)) {
      violations.push(`${jobId}: ${label} ${finding.path} must not contain fixture marker "${finding.marker}"`);
    }
  }

  for (const keyPath of unredactedSensitiveKeyPaths(content)) {
    violations.push(`${jobId}: ${label} must not contain unredacted sensitive key "${keyPath}"`);
  }
}

export function parseJsonEvidenceContent(content) {
  try {
    return { ok: true, value: JSON.parse(content) };
  } catch {
    return { ok: false, value: undefined };
  }
}

export function isStructuredJsonEvidence(value) {
  return typeof value === 'object' && value !== null;
}

function containsFixtureProvenance(value) {
  if (Array.isArray(value)) {
    return value.some((item) => containsFixtureProvenance(item));
  }
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  if (value.fixtureOnly === true || value.evidenceKind === 'fixture_example') {
    return true;
  }

  return Object.values(value).some((item) => containsFixtureProvenance(item));
}

function requiresRealArtifactMarkerGuard(content) {
  if (typeof content !== 'object' || content === null) {
    return false;
  }
  const format = content.artifactFormat ?? content.format;
  return typeof format === 'string' && realArtifactMarkerGuardFormats.has(format);
}

function fixtureMarkerFindings(value, path = []) {
  if (typeof value === 'string') {
    const marker = forbiddenRealArtifactMarkerPattern.exec(value);
    if (marker === null) {
      return [];
    }
    return [{
      marker: marker[1],
      path: path.length === 0 ? '<root>' : path.join('.'),
    }];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => fixtureMarkerFindings(item, [...path, String(index)]));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, child]) => fixtureMarkerFindings(child, [...path, key]));
}

function unredactedSensitiveKeyPaths(value, path = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => unredactedSensitiveKeyPaths(item, [...path, String(index)]));
  }
  if (typeof value !== 'object' || value === null) {
    return [];
  }

  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (isForbiddenArtifactKey(key) && !isRedactedArtifactValue(child)) {
      findings.push(nextPath.join('.'));
    }
    findings.push(...unredactedSensitiveKeyPaths(child, nextPath));
  }
  return findings;
}

function isForbiddenArtifactKey(key) {
  const normalized = normalizeArtifactKey(key);
  return forbiddenArtifactKeyNames.has(normalized)
    || forbiddenArtifactKeyPatterns.some((pattern) => pattern.test(normalized));
}

function normalizeArtifactKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRedactedArtifactValue(value) {
  if (value === null || value === false) {
    return true;
  }
  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.includes('not-redacted') || normalized.includes('not redacted') || normalized.includes('unredacted')) {
    return false;
  }
  // Only complete markers, optionally bracketed, may stand in for credential values.
  const placeholder = /^(?:redacted|masked|omitted|absent|unavailable)$/;
  return normalized.length === 0 || placeholder.test(normalized)
    || (normalized.startsWith('[') && normalized.endsWith(']') && placeholder.test(normalized.slice(1, -1)))
    || (normalized.startsWith('<') && normalized.endsWith('>') && placeholder.test(normalized.slice(1, -1)));
}

