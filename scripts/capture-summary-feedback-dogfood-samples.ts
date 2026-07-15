import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmodSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { defaultPostgresRuntimePoolConfig } from '@social-monitor/platform-persistence';
import { tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { PrismaSummaryConnection } from '../libs/summary/adapters/persistence/prisma/prisma-summary-connection';
import { PrismaSummaryFeedbackRepository } from '../libs/summary/adapters/persistence/prisma/prisma-summary-feedback.repository';
import { SummaryFeedback, type SummaryFeedbackCategory } from '../libs/summary/domain';
import { ExportSummaryFeedbackSamplesUseCase } from '../libs/summary/features/export-summary-feedback-samples/export-summary-feedback-samples.use-case';
import {
  formatSummaryFeedbackRuntimeFailure,
  requiredSummaryFeedbackEnv,
} from './lib/summary-feedback-runtime';

const artifactDir = resolve(
  readOptionalEnv('SUMMARY_FEEDBACK_EVIDENCE_ARTIFACT_DIR')
    ?? readOptionalEnv('BACKEND_STAGING_EVIDENCE_ARTIFACT_DIR')
    ?? '/tmp/social-monitor-evidence',
);
const redactedInputPath = evidenceJsonPath(
  'SUMMARY_FEEDBACK_REDACTED_INPUT_PATH',
  join(artifactDir, 'summary-feedback-dogfood-redacted-input.json'),
);
const realSamplesPath = evidenceJsonPath(
  'SUMMARY_REAL_FEEDBACK_SAMPLES_PATH',
  join(artifactDir, 'summary-real-feedback-samples.json'),
);
const samplesEnvPath = evidenceEnvPath(
  'SUMMARY_FEEDBACK_SAMPLES_ENV_PATH',
  join(artifactDir, 'summary-feedback-samples.env'),
);
const now = new Date();
const sampleWindow = {
  startedAt: readDateEnv('SUMMARY_FEEDBACK_WINDOW_STARTED_AT', new Date(now.getTime() - 2 * 60 * 60 * 1000)),
  endedAt: readDateEnv('SUMMARY_FEEDBACK_WINDOW_ENDED_AT', new Date(now.getTime() - 30 * 1000)),
};
const exportedAt = readDateEnv('SUMMARY_FEEDBACK_EXPORTED_AT', new Date(now.getTime() - 10 * 1000));
const runId = readOptionalEnv('SUMMARY_FEEDBACK_EXPORT_ID') ?? `SF-DOGFOOD-${compactTimestamp(now)}`;
const tenant = tenantId(readOptionalEnv('SUMMARY_FEEDBACK_TENANT_ID') ?? randomUUID());
const workspace = workspaceId(readOptionalEnv('SUMMARY_FEEDBACK_WORKSPACE_ID') ?? randomUUID());
const source = {
  kind: 'internal_dogfood' as const,
  environmentId: metadataEnv('SUMMARY_FEEDBACK_ENVIRONMENT_ID', 'dogfood-alpha-20260621'),
  operator: metadataEnv('SUMMARY_FEEDBACK_OPERATOR', 'release-operator'),
  collectionMethod: metadataEnv(
    'SUMMARY_FEEDBACK_COLLECTION_METHOD',
    'Redacted internal dogfood review collected from summary feedback API review queue.',
  ),
  redactedBy: metadataEnv('SUMMARY_FEEDBACK_REDACTED_BY', 'security-owner'),
  approvedBy: metadataEnv('SUMMARY_FEEDBACK_APPROVED_BY', 'release-owner'),
  export: {
    sourceSystem: metadataEnv('SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM', 'summary-feedback-api'),
    exportId: runId,
    exportedAt,
    reviewQueue: metadataEnv('SUMMARY_FEEDBACK_REVIEW_QUEUE', 'summary-quality-review'),
    redactionReviewId: metadataEnv('SUMMARY_FEEDBACK_REDACTION_REVIEW_ID', `SEC-REDACTION-${compactTimestamp(now)}`),
    approvalReference: metadataEnv('SUMMARY_FEEDBACK_APPROVAL_REFERENCE', `REL-APPROVAL-${compactTimestamp(now)}`),
  },
};

async function main(): Promise<void> {
  const connection = await PrismaSummaryConnection.create(
    defaultPostgresRuntimePoolConfig(requiredEnv('DATABASE_URL'), 'admin-tool'),
  );

  try {
    const feedback = new PrismaSummaryFeedbackRepository(connection);
    const seeded = dogfoodFeedbackSamples().map((sample, index) => toSummaryFeedback(sample, index));
    for (const item of seeded) {
      await feedback.save(item);
    }

    const exported = await new ExportSummaryFeedbackSamplesUseCase(feedback).execute({
      tenantId: tenant,
      workspaceId: workspace,
      sampleWindow,
      limit: 10,
      source,
    });
    if (!exported.ok) {
      throw exported.error;
    }
    if (exported.value.samples.length < 3) {
      throw new Error('Dogfood summary feedback export did not collect at least 3 samples');
    }

    writePrivateJson(redactedInputPath, exported.value);
  } finally {
    await connection.close();
  }

  execFileSync(process.execPath, ['scripts/capture-summary-feedback-samples.mjs'], {
    env: {
      ...process.env,
      SUMMARY_FEEDBACK_REDACTED_INPUT_PATH: redactedInputPath,
      SUMMARY_REAL_FEEDBACK_SAMPLES_PATH: realSamplesPath,
      SUMMARY_FEEDBACK_SAMPLES_ENV_PATH: samplesEnvPath,
      SUMMARY_FEEDBACK_SOURCE_KIND: source.kind,
      SUMMARY_FEEDBACK_ENVIRONMENT_ID: source.environmentId,
      SUMMARY_FEEDBACK_OPERATOR: source.operator,
      SUMMARY_FEEDBACK_COLLECTION_METHOD: source.collectionMethod,
      SUMMARY_FEEDBACK_REDACTED_BY: source.redactedBy,
      SUMMARY_FEEDBACK_APPROVED_BY: source.approvedBy,
      SUMMARY_FEEDBACK_EXPORT_SOURCE_SYSTEM: source.export.sourceSystem,
      SUMMARY_FEEDBACK_EXPORT_ID: source.export.exportId,
      SUMMARY_FEEDBACK_EXPORTED_AT: source.export.exportedAt.toISOString(),
      SUMMARY_FEEDBACK_REVIEW_QUEUE: source.export.reviewQueue,
      SUMMARY_FEEDBACK_REDACTION_REVIEW_ID: source.export.redactionReviewId,
      SUMMARY_FEEDBACK_APPROVAL_REFERENCE: source.export.approvalReference,
      BACKEND_GIT_COMMIT_SHA: readOptionalEnv('BACKEND_GIT_COMMIT_SHA') ?? currentGitCommitSha(),
    },
    stdio: 'inherit',
  });

  console.log(`SUMMARY_FEEDBACK_REDACTED_INPUT_PATH=${redactedInputPath}`);
}

type DogfoodFeedbackSample = {
  readonly category: SummaryFeedbackCategory;
  readonly rating: number;
  readonly triageOwner: 'summary-owner' | 'source-owner';
  readonly eligibleForEvalFixture: boolean;
  readonly comment: string;
};

function dogfoodFeedbackSamples(): readonly DogfoodFeedbackSample[] {
  return [
    {
      category: 'wrong_fact',
      rating: 2,
      triageOwner: 'summary-owner',
      eligibleForEvalFixture: true,
      comment: 'Dogfood reviewer found a claim that needed stronger citation grounding before beta release.',
    },
    {
      category: 'bad_citation',
      rating: 2,
      triageOwner: 'summary-owner',
      eligibleForEvalFixture: true,
      comment: 'Dogfood reviewer found a citation that was present but not precise enough for the claim.',
    },
    {
      category: 'missing_source',
      rating: 3,
      triageOwner: 'source-owner',
      eligibleForEvalFixture: false,
      comment: 'Dogfood reviewer found that a relevant in-window source item should be represented in the summary.',
    },
  ];
}

function toSummaryFeedback(sample: DogfoodFeedbackSample, index: number): SummaryFeedback {
  const summaryId = randomUUID();
  const interestId = randomUUID();
  const suffix = `${index + 1}-${compactTimestamp(now)}`;

  return SummaryFeedback.record({
    id: randomUUID(),
    tenantId: tenant,
    workspaceId: workspace,
    summaryId,
    interestId,
    idempotencyKey: `summary-feedback-dogfood-${suffix}`,
    submittedBy: 'dogfood-reviewer',
    rating: sample.rating,
    category: sample.category,
    comment: sample.comment,
    evidence: {
      summaryId,
      interestId,
      citationId: `dogfood-citation-${suffix}`,
      feedItemId: `dogfood-feed-item-${suffix}`,
      sourceItemId: `dogfood-source-item-${suffix}`,
      providerKey: index === 2 ? 'rss' : 'github',
    },
    triageOwner: sample.triageOwner,
    eligibleForEvalFixture: sample.eligibleForEvalFixture,
    createdAt: new Date(sampleWindow.endedAt.getTime() - (index + 1) * 1000),
  });
}

function requiredEnv(name: string): string {
  return requiredSummaryFeedbackEnv(name, readOptionalEnv(name));
}

function metadataEnv(name: string, fallback: string): string {
  const value = readOptionalEnv(name) ?? fallback;
  const normalized = value.toLowerCase();
  for (const fragment of ['example', 'fixture', 'synthetic', 'mock', 'test']) {
    if (normalized.includes(fragment)) {
      throw new Error(`${name} must not contain ${fragment}`);
    }
  }
  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

function readDateEnv(name: string, fallback: Date): Date {
  const value = readOptionalEnv(name);
  if (value === undefined) {
    return fallback;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be an ISO timestamp`);
  }
  return parsed;
}

function evidenceJsonPath(envName: string, fallback: string): string {
  return evidencePath(envName, fallback, '.json');
}

function evidenceEnvPath(envName: string, fallback: string): string {
  return evidencePath(envName, fallback, '.env');
}

function evidencePath(envName: string, fallback: string, extension: '.json' | '.env'): string {
  const path = resolve(readOptionalEnv(envName) ?? fallback);
  if (!isAbsolute(path)) {
    throw new Error(`${envName} must be an absolute ${extension} file path`);
  }
  if (!path.endsWith(extension)) {
    throw new Error(`${envName} must end with ${extension}`);
  }
  if (isInsideWorkspace(path)) {
    throw new Error(`${envName} must not write release evidence into the git workspace`);
  }
  if (isFixtureLikePath(path)) {
    throw new Error(`${envName} must not point to fixture or example paths`);
  }
  try {
    if (!statSync(path).isFile()) {
      throw new Error(`${envName} must point to a regular file path`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return path;
}

function isInsideWorkspace(path: string): boolean {
  const workspace = resolve(process.cwd());
  const relativePath = relative(workspace, path);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

function isFixtureLikePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase();
  return ['/fixtures/', '\\fixtures\\', '.example.', '-examples', '_examples'].some((fragment) =>
    normalized.includes(fragment.replaceAll('\\', '/').toLowerCase()),
  );
}

function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function compactTimestamp(date: Date): string {
  return date.toISOString().replaceAll(/[-:.TZ]/g, '').slice(0, 14);
}

function currentGitCommitSha(): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
}

void main().catch((error) => {
  console.error(formatSummaryFeedbackRuntimeFailure(error));
  process.exit(1);
});
