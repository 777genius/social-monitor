import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { PrismaSummaryConnection } from '../libs/summary/adapters/persistence/prisma/prisma-summary-connection';
import { PrismaSummaryFeedbackRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository';
import { ExportSummaryFeedbackSamplesUseCase } from '../libs/summary/features/export-summary-feedback-samples/export-summary-feedback-samples.use-case';
import {
  formatSummaryFeedbackRuntimeFailure,
  requiredSummaryFeedbackEnv,
} from './lib/summary-feedback-runtime';

const outputPathEnv = 'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH';
const envFilePathEnv = 'SUMMARY_FEEDBACK_EXPORT_ENV_PATH';
const forbiddenPathFragments = ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples'];

async function main(): Promise<void> {
  const outputPath = validateEvidenceJsonFilePath(requiredEnv(outputPathEnv), outputPathEnv);
  const envFilePath = validateEvidenceEnvFilePath(optionalEnv(envFilePathEnv) ?? `${outputPath}.env`);
  const connection = new PrismaSummaryConnection(requiredEnv('DATABASE_URL'));

  try {
    const result = await new ExportSummaryFeedbackSamplesUseCase(
      new PrismaSummaryFeedbackRepository(connection),
    ).execute({
      tenantId: tenantId(requiredEnv('SUMMARY_FEEDBACK_TENANT_ID')),
      workspaceId: workspaceId(requiredEnv('SUMMARY_FEEDBACK_WORKSPACE_ID')),
      sampleWindow: {
        startedAt: readDateEnv('SUMMARY_FEEDBACK_WINDOW_STARTED_AT'),
        endedAt: readDateEnv('SUMMARY_FEEDBACK_WINDOW_ENDED_AT'),
      },
      limit: readIntegerEnv('SUMMARY_FEEDBACK_EXPORT_LIMIT', 100),
      source: {
        kind: readSourceKind(),
        environmentId: requiredEnv('SUMMARY_FEEDBACK_ENVIRONMENT_ID'),
        operator: requiredEnv('SUMMARY_FEEDBACK_OPERATOR'),
        collectionMethod: requiredEnv('SUMMARY_FEEDBACK_COLLECTION_METHOD'),
        redactedBy: requiredEnv('SUMMARY_FEEDBACK_REDACTED_BY'),
        approvedBy: requiredEnv('SUMMARY_FEEDBACK_APPROVED_BY'),
        export: {
          sourceSystem: requiredEnv('SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM'),
          exportId: requiredEnv('SUMMARY_FEEDBACK_EXPORT_ID'),
          exportedAt: readDateEnv('SUMMARY_FEEDBACK_EXPORTED_AT'),
          reviewQueue: requiredEnv('SUMMARY_FEEDBACK_REVIEW_QUEUE'),
          redactionReviewId: requiredEnv('SUMMARY_FEEDBACK_REDACTION_REVIEW_ID'),
          approvalReference: requiredEnv('SUMMARY_FEEDBACK_APPROVAL_REFERENCE'),
        },
      },
    });

    if (!result.ok) {
      throw result.error;
    }
    if (result.value.samples.length < readIntegerEnv('SUMMARY_FEEDBACK_MIN_SAMPLES', 2)) {
      throw new Error('Summary feedback export did not collect enough redacted samples for release evidence');
    }

    writePrivateJson(outputPath, result.value);
    writePrivateEnvFile(envFilePath, outputPath);
    console.log(`${outputPathEnv}=${outputPath}`);
    console.log(`${envFilePathEnv}=${envFilePath}`);
  } finally {
    await connection.close();
  }
}

function requiredEnv(name: string): string {
  return requiredSummaryFeedbackEnv(name);
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readDateEnv(name: string): Date {
  const value = requiredEnv(name);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be an ISO timestamp`);
  }
  return parsed;
}

function readIntegerEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function readSourceKind(): 'internal_dogfood' | 'private_beta' {
  const value = requiredEnv('SUMMARY_FEEDBACK_SOURCE_KIND');
  if (value === 'internal_dogfood' || value === 'private_beta') {
    return value;
  }
  throw new Error('SUMMARY_FEEDBACK_SOURCE_KIND must be internal_dogfood or private_beta');
}

function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function writePrivateEnvFile(path: string, outputPath: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    [
      '# Generated summary feedback export env file.',
      '# Load this file before running npm run capture:summary-feedback-samples.',
      `${outputPathEnv}=${shellQuote(outputPath)}`,
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
  chmodSync(path, 0o600);
}

function validateEvidenceJsonFilePath(path: string, label: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`${label} must be an absolute JSON file path`);
  }
  const resolvedPath = resolve(path);
  if (!resolvedPath.endsWith('.json')) {
    throw new Error(`${label} must end with .json`);
  }
  if (isInsideWorkspace(resolvedPath)) {
    throw new Error(`${label} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(resolvedPath)) {
    throw new Error(`${label} must not point to fixture or example paths`);
  }
  if (existsSync(resolvedPath) && !statSync(resolvedPath).isFile()) {
    throw new Error(`${label} must point to a regular file path`);
  }
  return resolvedPath;
}

function validateEvidenceEnvFilePath(path: string): string {
  if (!isAbsolute(path)) {
    throw new Error(`${envFilePathEnv} must be an absolute env file path`);
  }
  const resolvedPath = resolve(path);
  if (!resolvedPath.endsWith('.env')) {
    throw new Error(`${envFilePathEnv} must end with .env`);
  }
  if (isInsideWorkspace(resolvedPath)) {
    throw new Error(`${envFilePathEnv} must not write release env handoff into the git workspace`);
  }
  if (isFixtureLikePath(resolvedPath)) {
    throw new Error(`${envFilePathEnv} must not point to fixture or example paths`);
  }
  if (existsSync(resolvedPath) && !statSync(resolvedPath).isFile()) {
    throw new Error(`${envFilePathEnv} must point to a regular file path`);
  }
  return resolvedPath;
}

function isInsideWorkspace(path: string): boolean {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return forbiddenPathFragments.some((fragment) => normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()));
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

void main().catch((error) => {
  console.error(formatSummaryFeedbackRuntimeFailure(error));
  process.exit(1);
});
