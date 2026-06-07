import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const allowlistPath = 'ops/security/secret-scan-allowlist.json';
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));
const allowedLiteralValues = new Set(allowlist.allowedLiteralValues ?? []);
const allowedValuePrefixes = allowlist.allowedValuePrefixes ?? [];
const ignoredPaths = allowlist.ignoredPaths ?? [];
const violations = [];

if (allowlist.schemaVersion !== 1) {
  violations.push(`${allowlistPath}: schemaVersion must be 1`);
}

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter((path) => path.length > 0)
  .filter((path) => !ignoredPaths.some((ignoredPath) => path.startsWith(ignoredPath)));

const textFilePattern = /\.(cjs|conf|env|example|json|js|md|mjs|prisma|sh|sql|ts|tsx|txt|yaml|yml)$/i;
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/;
const envSecretPattern = /(?:^|\n)\s*([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY)[A-Z0-9_]*)\s*=\s*([^\s#]+)/g;
const bearerPattern = /Bearer\s+([A-Za-z0-9._~+/=-]+)/g;
const generatedKeyPattern = /\b((?:smk|whsec)_[A-Za-z0-9._${}-]+)\b/g;
const credentialUrlPattern = /\b(?:postgresql|postgres|mysql|redis|amqp):\/\/[^:\s/@]+:([^@\s]+)@/g;

const isAllowedValue = (value) => {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '');
  return (
    allowedLiteralValues.has(normalized) ||
    allowedValuePrefixes.some((prefix) => normalized.startsWith(prefix)) ||
    normalized.includes('...')
  );
};

const report = (file, reason, value) => {
  const suffix = value === undefined ? '' : ` (${value})`;
  violations.push(`${file}: ${reason}${suffix}`);
};

for (const file of trackedFiles) {
  if (!textFilePattern.test(file)) {
    continue;
  }

  const content = readFileSync(file, 'utf8');

  if (privateKeyPattern.test(content)) {
    report(file, 'private key block is not allowed');
  }

  for (const match of content.matchAll(envSecretPattern)) {
    const [, key, value] = match;
    if (!isAllowedValue(value)) {
      report(file, `secret-like env var "${key}" must use a documented placeholder`, value);
    }
  }

  for (const match of content.matchAll(bearerPattern)) {
    const [, value] = match;
    if (!isAllowedValue(value)) {
      report(file, 'bearer token literal is not allowed', value);
    }
  }

  for (const match of content.matchAll(generatedKeyPattern)) {
    const [, value] = match;
    if (!isAllowedValue(value)) {
      report(file, 'generated API/webhook key literal is not allowed', value);
    }
  }

  for (const match of content.matchAll(credentialUrlPattern)) {
    const [, value] = match;
    if (!isAllowedValue(value)) {
      report(file, 'credential URL password must use a documented placeholder', value);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Secret scan contract OK');
