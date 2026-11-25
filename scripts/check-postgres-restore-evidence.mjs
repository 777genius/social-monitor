import { readFileSync } from 'node:fs';

import { readPrivateEvidenceJsonFile } from './lib/evidence-env-file.mjs';
import { compileBackupRestoreDrillContract } from './lib/backup-restore-drill-contract.mjs';
import { validatePostgresRestoreEvidence } from './lib/postgres-restore-evidence-validator.mjs';

const contract = compileBackupRestoreDrillContract(JSON.parse(
  readFileSync('ops/recovery/backup-restore-contract.json', 'utf8'),
));
const fixture = JSON.parse(readFileSync(
  'ops/drills/fixtures/staging-reliability-artifact-examples.json',
  'utf8',
));
const fixtureArtifact = fixture.examples?.find(
  (artifact) => artifact.artifactId === 'postgres-restore-drill-output',
);
const violations = validatePostgresRestoreEvidence(fixtureArtifact, contract)
  .map((message) => `Postgres restore fixture: ${message}`);

const realArtifactPath = process.env.POSTGRES_RESTORE_DRILL_ARTIFACT_PATH?.trim();
if (realArtifactPath) {
  const realArtifact = JSON.parse(readPrivateEvidenceJsonFile(
    realArtifactPath,
    'POSTGRES_RESTORE_DRILL_ARTIFACT_PATH',
  ));
  violations.push(...validatePostgresRestoreEvidence(realArtifact, contract)
    .map((message) => `POSTGRES_RESTORE_DRILL_ARTIFACT_PATH: ${message}`));
}

if (violations.length > 0) {
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log('Postgres restore evidence contract OK');
