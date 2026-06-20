import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  shellQuote,
  validateEvidenceEnvFilePath,
  validateEvidenceJsonFilePath,
  writeEvidenceEnvFile,
} from './lib/evidence-env-file.mjs';

const tempDirectory = mkdtempSync(join(tmpdir(), 'evidence-env-file-'));
const violations = [];

try {
  validatePositiveWrite();
  validatePositiveJsonPath();
  validateWorkspacePathRejected();
  validateWorkspaceJsonPathRejected();
  validateFixturePathRejected();
  validateFixtureJsonPathRejected();
  validateRelativeJsonPathRejected();
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Evidence env file writer OK');

function validatePositiveWrite() {
  const envFilePath = join(tempDirectory, 'external-beta.env');
  writeEvidenceEnvFile(envFilePath, [
    ['API_BASE_URL', 'https://api.staging.social-monitor.invalid'],
    ['SINGLE_QUOTE_VALUE', "owner's-review"],
    ['EMPTY_VALUE_SKIPPED', ''],
  ], {
    usageLines: ['source in an operator shell only'],
  });

  const content = readFileSync(envFilePath, 'utf8');
  if (!content.includes("API_BASE_URL='https://api.staging.social-monitor.invalid'")) {
    violations.push('evidence env file must shell-quote simple values');
  }
  if (!content.includes(`SINGLE_QUOTE_VALUE=${shellQuote("owner's-review")}`)) {
    violations.push('evidence env file must escape single quotes safely');
  }
  if (content.includes('EMPTY_VALUE_SKIPPED=')) {
    violations.push('evidence env file must skip empty values');
  }
  if ((statSync(envFilePath).mode & 0o077) !== 0) {
    violations.push('evidence env file must be written with 0600-style permissions');
  }
}

function validateWorkspacePathRejected() {
  assertRejected(
    () => validateEvidenceEnvFilePath(`${process.cwd()}/workspace-output.env`),
    'workspace path',
    'must not be inside the git workspace',
  );
}

function validatePositiveJsonPath() {
  const jsonPath = join(tempDirectory, 'release-evidence.json');
  const resolved = validateEvidenceJsonFilePath(jsonPath, 'RELEASE_EVIDENCE_PATH');
  if (resolved !== jsonPath) {
    violations.push('evidence JSON path helper must return the resolved JSON path');
  }
}

function validateWorkspaceJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath(`${process.cwd()}/workspace-output.json`, 'RELEASE_EVIDENCE_PATH'),
    'workspace JSON path',
    'must not write release evidence into the git workspace',
  );
}

function validateFixturePathRejected() {
  assertRejected(
    () => validateEvidenceEnvFilePath(join(tempDirectory, 'fixtures', 'output.env')),
    'fixture path',
    'must not point to fixture or example paths',
  );
}

function validateFixtureJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath(join(tempDirectory, 'fixtures', 'output.json'), 'RELEASE_EVIDENCE_PATH'),
    'fixture JSON path',
    'must not point to fixture or example paths',
  );
}

function validateRelativeJsonPathRejected() {
  assertRejected(
    () => validateEvidenceJsonFilePath('relative-output.json', 'RELEASE_EVIDENCE_PATH'),
    'relative JSON path',
    'must be an absolute JSON file path',
  );
}

function assertRejected(fn, label, expectedMessage) {
  try {
    fn();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      violations.push(`expected ${label} rejection to include "${expectedMessage}"`);
    }
    return;
  }

  violations.push(`expected ${label} to be rejected`);
}
