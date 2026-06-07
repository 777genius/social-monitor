import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const policyPath = 'ops/security/dependency-audit-policy.json';
const policy = JSON.parse(readFileSync(policyPath, 'utf8'));
const violations = [];
const blockSeverities = new Set(policy.blockSeverities ?? []);
const allowedExceptions = new Map((policy.allowedExceptions ?? []).map((exception) => [exception.packageName, exception]));

if (policy.schemaVersion !== 1) {
  violations.push(`${policyPath}: schemaVersion must be 1`);
}

if (policy.auditCommand !== 'npm audit --json --audit-level=high') {
  violations.push(`${policyPath}: auditCommand must stay pinned to npm audit --json --audit-level=high`);
}

for (const severity of ['high', 'critical']) {
  if (!blockSeverities.has(severity)) {
    violations.push(`${policyPath}: blockSeverities must include ${severity}`);
  }
}

for (const exception of policy.allowedExceptions ?? []) {
  for (const field of ['packageName', 'owner', 'expiresAt', 'mitigation']) {
    if (typeof exception[field] !== 'string' || exception[field].trim().length === 0) {
      violations.push(`${policyPath}: dependency exception must define ${field}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(exception.expiresAt ?? ''))) {
    violations.push(`${policyPath}: dependency exception "${exception.packageName}" must use YYYY-MM-DD expiresAt`);
  }
}

let audit;
try {
  audit = JSON.parse(execFileSync('npm', ['audit', '--json', '--audit-level=high'], { encoding: 'utf8' }));
} catch (error) {
  const stdout = String(error.stdout ?? '').trim();
  if (stdout.length === 0) {
    throw error;
  }
  audit = JSON.parse(stdout);
}

for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities ?? {})) {
  if (!blockSeverities.has(vulnerability.severity)) {
    continue;
  }

  const exception = allowedExceptions.get(packageName);
  if (exception === undefined) {
    violations.push(`${packageName}: ${vulnerability.severity} vulnerability has no approved exception`);
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Dependency audit contract OK');
