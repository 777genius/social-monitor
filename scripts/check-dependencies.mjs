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

  // An exception that names advisories covers only those at blocking severity: advisory objects must match by id
  // (advisories below blockSeverities are ignored, like everywhere else in this gate), and a derived entry (a
  // package name in `via`) must itself be an excepted package.
  if (exception.advisories !== undefined) {
    for (const via of vulnerability.via ?? []) {
      const covered =
        typeof via === 'string'
          ? allowedExceptions.has(via)
          : !blockSeverities.has(via.severity) ||
            exception.advisories.some((id) => String(via.url ?? '').endsWith(`/${id}`));
      if (!covered) {
        const label = typeof via === 'string' ? via : (via.url ?? via.title ?? 'unknown advisory');
        violations.push(`${packageName}: ${label} is not covered by the approved exception`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Dependency audit contract OK');
