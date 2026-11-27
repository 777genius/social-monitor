import { execFileSync, execSync } from 'node:child_process';
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

const today = new Date().toISOString().slice(0, 10);
const isCalendarDate = (value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const exceptionKeys = new Set(['packageName', 'owner', 'expiresAt', 'mitigation', 'advisories']);
const advisoryId = /^GHSA(-[2-9cfghjmpqrvwx]{4}){3}$/;

for (const exception of policy.allowedExceptions ?? []) {
  for (const key of Object.keys(exception)) {
    if (!exceptionKeys.has(key)) {
      violations.push(`${policyPath}: dependency exception "${exception.packageName}" has unknown field ${key}`);
    }
  }

  if (exception.advisories !== undefined &&
      (!Array.isArray(exception.advisories) || exception.advisories.length === 0 ||
       !exception.advisories.every((id) => typeof id === 'string' && advisoryId.test(id)))) {
    violations.push(`${policyPath}: dependency exception "${exception.packageName}" advisories must be a non-empty list of GHSA ids`);
  }

  for (const field of ['packageName', 'owner', 'expiresAt', 'mitigation']) {
    if (typeof exception[field] !== 'string' || exception[field].trim().length === 0) {
      violations.push(`${policyPath}: dependency exception must define ${field}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(exception.expiresAt ?? ''))) {
    violations.push(`${policyPath}: dependency exception "${exception.packageName}" must use YYYY-MM-DD expiresAt`);
  } else if (!isCalendarDate(exception.expiresAt)) {
    violations.push(`${policyPath}: dependency exception "${exception.packageName}" expiresAt ${exception.expiresAt} is not a real calendar date`);
  } else if (exception.expiresAt < today) {
    violations.push(`${policyPath}: dependency exception "${exception.packageName}" expired on ${exception.expiresAt}`);
  }
}

let audit;
let auditExit = 0;
try {
  const auditJson =
    process.platform === 'win32'
      ? execSync('npm audit --json --audit-level=high', { encoding: 'utf8' })
      : execFileSync('npm', ['audit', '--json', '--audit-level=high'], { encoding: 'utf8' });
  audit = JSON.parse(auditJson);
} catch (error) {
  const stdout = String(error.stdout ?? '').trim();
  if (error.status !== 1 || error.signal || stdout.length === 0) {
    throw error;
  }
  audit = JSON.parse(stdout);
  auditExit = error.status;
}

// npm audit exits 1 for blocking findings, but registry failures also exit 1.
// Never interpret a failed or incomplete report as an empty vulnerability list.
const severities = new Set(['info', 'low', 'moderate', 'high', 'critical']);
if (audit?.auditReportVersion !== 2 || Object.hasOwn(audit, 'error') ||
    !audit.vulnerabilities || typeof audit.vulnerabilities !== 'object' || Array.isArray(audit.vulnerabilities) ||
    Object.values(audit.vulnerabilities).some((v) => !severities.has(v?.severity)) ||
    (auditExit !== 0 && !Object.values(audit.vulnerabilities).some((v) => blockSeverities.has(v.severity)))) {
  console.error('Dependency audit did not return a valid npm audit report');
  process.exit(1);
}

for (const [packageName, vulnerability] of Object.entries(audit.vulnerabilities)) {
  if (!blockSeverities.has(vulnerability.severity)) {
    continue;
  }

  const exception = allowedExceptions.get(packageName);
  if (exception === undefined) {
    violations.push(`${packageName}: ${vulnerability.severity} vulnerability has no approved exception`);
    continue;
  }

  // The root exception must cover every blocking advisory reached through npm's
  // derived package entries, even when a child has its own package-wide exception.
  if (exception.advisories !== undefined) {
    const evidenceSeverity = (via) => typeof via === 'string'
      ? (Object.hasOwn(audit.vulnerabilities, via) ? audit.vulnerabilities[via].severity : undefined)
      : via?.severity;
    const visiting = new Set();
    const checked = new Set();
    const visit = (name) => {
      if (checked.has(name)) return true;
      if (visiting.has(name)) return false;
      visiting.add(name);
      const { via } = audit.vulnerabilities[name];
      if (!Array.isArray(via) || via.length === 0 ||
          via.some((entry) => !severities.has(evidenceSeverity(entry))) ||
          !via.some((entry) => blockSeverities.has(evidenceSeverity(entry)))) {
        return false;
      }
      for (const entry of via) {
        if (typeof entry === 'string') {
          if (!allowedExceptions.has(entry) ||
              (blockSeverities.has(evidenceSeverity(entry)) && !visit(entry))) return false;
        } else if (blockSeverities.has(entry.severity) &&
            !exception.advisories.some((id) => String(entry.url ?? '').endsWith(`/${id}`))) {
          return false;
        }
      }
      visiting.delete(name);
      checked.add(name);
      return true;
    };
    if (!visit(packageName)) {
      violations.push(`${packageName}: incomplete or out-of-scope advisory evidence for approved exception`);
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Dependency audit contract OK');
