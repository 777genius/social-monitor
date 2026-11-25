// Security/credential negative scenario declarations only; caller owns file I/O and process execution.
export function credentialRotationNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'source rotation fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateSource: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for source credential rotation schema validation.',
          runner: 'ops/security/fixtures/source-credential-rotation-redacted-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'source rotation missing preview operation',
      expectedOutput: 'operations must include preview-redaction-proof',
      mutateSource: (artifact) => {
        artifact.operations = artifact.operations.filter(
          (operation) => operation.operationId !== 'preview-redaction-proof',
        );
      },
    },
    {
      label: 'webhook rotation plaintext redaction flag',
      expectedOutput: 'unredacted sensitive key',
      mutateWebhook: (artifact) => {
        artifact.redaction.plaintextCredentialValuesIncluded = true;
      },
    },
    {
      label: 'webhook rotation unchanged old key',
      expectedOutput: 'old-key-rejected-after-rotation must change key id',
      mutateWebhook: (artifact) => {
        const operation = artifact.operations.find(
          (item) => item.operationId === 'old-key-rejected-after-rotation',
        );
        operation.keyIdAfter = operation.keyIdBefore;
      },
    },
    {
      label: 'source rotation secret store mismatch',
      expectedOutput: 'secretStoreId must match STAGING_SECRET_STORE_ID',
      mutateSource: (artifact) => {
        artifact.environment.secretStoreId = 'secret-store-staging-other-1';
      },
    },
    {
      label: 'source rotation nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateSource: (artifact) => {
        artifact.operations[0].safeEvidence.credentialRecordId = 'source-credential-example-001';
      },
    },
    {
      label: 'source rotation raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      sourceContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"plaintextObserved": false',
        [
          '"plaintextObserved": false,\n        "authorization": "',
          ['Bearer', ' raw-rotation-token-hidden-by-duplicate-key'].join(''),
          '",\n        "authorization": "redacted"',
        ].join(''),
      ),
    },
  ];
  return scenarios;
}

export function securityFinalSweepNegativeSmokeScenarios() {
  const scenarios = [
    {
      label: 'security sweep fixture provenance',
      expectedOutput: 'fixture provenance',
      mutateArtifact: (artifact) => {
        artifact.provenance = {
          evidenceKind: 'fixture_example',
          collectionMethod: 'Synthetic fixture example for security final sweep schema validation.',
          runner: 'ops/security/fixtures/security-final-sweep-staging-artifact-examples.json',
          fixtureOnly: true,
        };
      },
    },
    {
      label: 'security sweep missing public error export',
      expectedOutput: 'sourceExports must include public-errors',
      mutateArtifact: (artifact) => {
        artifact.sourceExports = artifact.sourceExports.filter(
          (sourceExport) => sourceExport.surfaceId !== 'public-errors',
        );
      },
    },
    {
      label: 'security sweep missing audit metadata export',
      expectedOutput: 'sourceExports must include audit-metadata',
      mutateArtifact: (artifact) => {
        artifact.sourceExports = artifact.sourceExports.filter(
          (sourceExport) => sourceExport.surfaceId !== 'audit-metadata',
        );
      },
    },
    {
      label: 'security sweep mismatched export digest',
      expectedOutput: 'sha256 must match the export file content',
      mutateArtifact: (artifact) => {
        const logExport = artifact.sourceExports.find((sourceExport) => sourceExport.surfaceId === 'logs');
        logExport.sha256 = '0'.repeat(64);
      },
    },
    {
      label: 'security sweep unsafe diagnostic field',
      expectedOutput: 'unsafe diagnostic field',
      mutateArtifact: (artifact) => {
        const logsSurface = artifact.surfaces.find((surface) => surface.surfaceId === 'logs');
        logsSurface.safeDiagnosticFields.push(['to', 'ken'].join(''));
      },
    },
    {
      label: 'security sweep export sensitive literal',
      expectedOutput: 'LOG_EXPORT_PATH must not contain sensitive literal fragment',
      mutateExports: (exportsBySurface) => {
        exportsBySurface.logs.records.push({
          requestId: 'req-leak-1',
          message: ['bearer', ' leaked-value'].join(''),
        });
      },
    },
    {
      label: 'security sweep raw source redaction flag',
      expectedOutput: 'redaction.rawSourceTextIncluded must be false',
      mutateArtifact: (artifact) => {
        artifact.redaction.rawSourceTextIncluded = true;
      },
    },
    {
      label: 'security sweep nested fixture marker',
      expectedOutput: 'must not contain fixture marker "example"',
      mutateArtifact: (artifact) => {
        artifact.surfaces[0].leakClassResults[0].sampleId = 'security-sweep-example-001';
      },
    },
    {
      label: 'security sweep raw duplicate-key credential hidden by JSON parser',
      expectedOutput: 'sensitive literal fragment "bearer "',
      artifactContent: (artifact) => `${JSON.stringify(artifact, null, 2)}\n`.replace(
        '"operator": "security-owner-1"',
        [
          '"operator": "',
          ['Bearer', ' raw-security-token-hidden-by-duplicate-key'].join(''),
          '",\n    "operator": "security-owner-1"',
        ].join(''),
      ),
    },
  ];
  return scenarios;
}
