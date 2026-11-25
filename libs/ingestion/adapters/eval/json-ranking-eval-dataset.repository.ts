import { readFileSync } from 'node:fs';

import type { JsonObject } from '@social-monitor/shared-kernel';

import type {
  CandidateLabel,
  RankingEvalCandidate,
  RankingEvalCase,
  RankingEvalLane,
  RankingEvalQualityGates,
  SourceItemRankingMode,
} from '../../domain';
import type { EvalDatasetRepositoryPort, RankingEvalDataset } from '../../ports';
import { readOptionalQueryPlannerIntent } from './json-ranking-eval-query-planner-intent';

type JsonRecord = Readonly<Record<string, unknown>>;

export class JsonRankingEvalDatasetRepository implements EvalDatasetRepositoryPort {
  constructor(private readonly datasetPath: string) {}

  async loadDataset(): Promise<RankingEvalDataset> {
    const parsed = JSON.parse(readFileSync(this.datasetPath, 'utf8')) as unknown;
    const record = readRecord(parsed, 'dataset');
    const dataset = {
      schemaVersion: readLiteralNumber(record, 'schemaVersion', 1, 'dataset'),
      datasetVersion: readRequiredString(record, 'datasetVersion', 'dataset'),
      generatedBy: readRequiredString(record, 'generatedBy', 'dataset'),
      labelingPolicy: readRequiredString(record, 'labelingPolicy', 'dataset'),
      qualityGates: readOptionalQualityGates(record.qualityGates),
      cases: readArray(record.cases, 'dataset.cases').map((item, index) =>
        readEvalCase(item, `dataset.cases[${index}]`),
      ),
    };

    if (dataset.cases.length === 0) {
      throw new Error('Ranking eval dataset must include at least one case');
    }

    return dataset;
  }
}

const readEvalCase = (value: unknown, path: string): RankingEvalCase => {
  const record = readRecord(value, path);
  const candidates = readArray(record.candidates, `${path}.candidates`).map(
    (item, index) => readCandidate(item, `${path}.candidates[${index}]`),
  );
  const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));
  const labels = readArray(record.labels, `${path}.labels`).map((item, index) =>
    readLabel(item, `${path}.labels[${index}]`, candidateIds),
  );

  if (candidates.length === 0) {
    throw new Error(`${path}.candidates must include at least one candidate`);
  }

  if (labels.length !== candidateIds.size) {
    throw new Error(`${path}.labels must include one label per candidate`);
  }

  return {
    caseId: readRequiredString(record, 'caseId', path),
    topic: readRequiredString(record, 'topic', path),
    sourceKeys: readStringArray(record.sourceKeys, `${path}.sourceKeys`),
    queryLanes: readArray(record.queryLanes, `${path}.queryLanes`).map(
      (item, index) => readLane(item, `${path}.queryLanes[${index}]`),
    ),
    queryPlannerIntent: readOptionalQueryPlannerIntent(
      record.queryPlannerIntent,
      `${path}.queryPlannerIntent`,
    ),
    rankingMode: readOptionalRankingMode(record.rankingMode, `${path}.rankingMode`),
    rankingQueries: readOptionalStringArray(
      record.rankingQueries,
      `${path}.rankingQueries`,
    ),
    candidates,
    labels,
  };
};

const readLane = (value: unknown, path: string): RankingEvalLane => {
  const record = readRecord(value, path);

  return {
    laneId: readRequiredString(record, 'laneId', path),
    sourceKey: readRequiredString(record, 'sourceKey', path),
    operation: readRequiredString(record, 'operation', path),
    query: readRequiredString(record, 'query', path),
    maxItems: readInteger(record.maxItems, 1, 1_000, `${path}.maxItems`),
  };
};

const readCandidate = (value: unknown, path: string): RankingEvalCandidate => {
  const record = readRecord(value, path);
  const publishedAt = new Date(
    readRequiredString(record, 'publishedAt', path),
  );

  if (Number.isNaN(publishedAt.getTime())) {
    throw new Error(`${path}.publishedAt must be an ISO date`);
  }

  return {
    candidateId: readRequiredString(record, 'candidateId', path),
    providerKey: readRequiredString(record, 'providerKey', path),
    externalId: readRequiredString(record, 'externalId', path),
    canonicalUrl: readRequiredString(record, 'canonicalUrl', path),
    title: readRequiredString(record, 'title', path),
    body: readRequiredString(record, 'body', path),
    authorHandle: readOptionalString(record.authorHandle, `${path}.authorHandle`),
    publishedAt,
    metadata: readOptionalJsonObject(record.metadata, `${path}.metadata`),
    snapshotRank: readOptionalInteger(record.snapshotRank, 1, 10_000, `${path}.snapshotRank`),
  };
};

const readLabel = (
  value: unknown,
  path: string,
  candidateIds: ReadonlySet<string>,
): CandidateLabel => {
  const record = readRecord(value, path);
  const candidateId = readRequiredString(record, 'candidateId', path);

  if (!candidateIds.has(candidateId)) {
    throw new Error(`${path}.candidateId references an unknown candidate`);
  }

  const duplicateOf = readOptionalString(record.duplicateOf, `${path}.duplicateOf`);
  if (duplicateOf !== undefined) {
    if (duplicateOf === candidateId) {
      throw new Error(`${path}.duplicateOf must not reference itself`);
    }

    if (!candidateIds.has(duplicateOf)) {
      throw new Error(`${path}.duplicateOf references an unknown candidate`);
    }
  }

  return {
    candidateId,
    relevance: readInteger(record.relevance, 0, 3, `${path}.relevance`),
    usefulness: readInteger(record.usefulness, 0, 3, `${path}.usefulness`),
    authority: readInteger(record.authority, 0, 2, `${path}.authority`),
    novelty: readInteger(record.novelty, 0, 2, `${path}.novelty`),
    confidence: readNumber(record.confidence, 0, 1, `${path}.confidence`),
    mustHave: readOptionalBoolean(record.mustHave, `${path}.mustHave`),
    duplicateOf,
    officialSignal: readOptionalBoolean(
      record.officialSignal,
      `${path}.officialSignal`,
    ),
    communitySignal: readOptionalBoolean(
      record.communitySignal,
      `${path}.communitySignal`,
    ),
    viralOffTopic: readOptionalBoolean(
      record.viralOffTopic,
      `${path}.viralOffTopic`,
    ),
    spam: readOptionalBoolean(record.spam, `${path}.spam`),
    notes: readOptionalString(record.notes, `${path}.notes`),
  };
};

const readOptionalQualityGates = (
  value: unknown,
): RankingEvalQualityGates | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const record = readRecord(value, 'dataset.qualityGates');

  return {
    minPrecisionAt10: readNumber(
      record.minPrecisionAt10,
      0,
      1,
      'dataset.qualityGates.minPrecisionAt10',
    ),
    minNdcgAt20: readNumber(
      record.minNdcgAt20,
      0,
      1,
      'dataset.qualityGates.minNdcgAt20',
    ),
    minMustHaveRecallAt20: readNumber(
      record.minMustHaveRecallAt20,
      0,
      1,
      'dataset.qualityGates.minMustHaveRecallAt20',
    ),
    maxDuplicateRateAt20: readNumber(
      record.maxDuplicateRateAt20,
      0,
      1,
      'dataset.qualityGates.maxDuplicateRateAt20',
    ),
    minSourceDiversityAt20: readNumber(
      record.minSourceDiversityAt20,
      0,
      1,
      'dataset.qualityGates.minSourceDiversityAt20',
    ),
    minOfficialCommunityCoverageAt20: readNumber(
      record.minOfficialCommunityCoverageAt20,
      0,
      1,
      'dataset.qualityGates.minOfficialCommunityCoverageAt20',
    ),
    maxViralOffTopicAt10: readNumber(
      record.maxViralOffTopicAt10,
      0,
      10,
      'dataset.qualityGates.maxViralOffTopicAt10',
    ),
    maxLowConfidenceLabelRate: readNumber(
      record.maxLowConfidenceLabelRate,
      0,
      1,
      'dataset.qualityGates.maxLowConfidenceLabelRate',
    ),
  };
};

const readRecord = (value: unknown, path: string): JsonRecord => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value as JsonRecord;
};

const readArray = (value: unknown, path: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value;
};

const readRequiredString = (
  record: JsonRecord,
  key: string,
  path: string,
): string => {
  const value = readOptionalString(record[key], `${path}.${key}`);

  if (value === undefined) {
    throw new Error(`${path}.${key} must be a non-empty string`);
  }

  return value;
};

const readStringArray = (value: unknown, path: string): readonly string[] => {
  const items = readArray(value, path).flatMap((item, index) => {
    const parsed = readOptionalString(item, `${path}[${index}]`);

    return parsed === undefined ? [] : [parsed];
  });

  if (items.length === 0) {
    throw new Error(`${path} must contain at least one string`);
  }

  return compactUnique(items);
};

const readOptionalStringArray = (
  value: unknown,
  path: string,
): readonly string[] | undefined =>
  value === undefined ? undefined : readStringArray(value, path);

const readOptionalString = (value: unknown, path: string): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string`);
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
};

const readOptionalRankingMode = (
  value: unknown,
  path: string,
): SourceItemRankingMode | undefined => {
  const mode = readOptionalString(value, path);

  if (mode === undefined) {
    return undefined;
  }

  if (mode === 'relevance' || mode === 'hybrid' || mode === 'engagement') {
    return mode;
  }

  throw new Error(`${path} must be relevance, hybrid or engagement`);
};

const readOptionalJsonObject = (
  value: unknown,
  path: string,
): JsonObject | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }

  return value as JsonObject;
};

const readOptionalBoolean = (
  value: unknown,
  path: string,
): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
};

const readLiteralNumber = (
  record: JsonRecord,
  key: string,
  expected: number,
  path: string,
): 1 => {
  const value = readNumber(record[key], expected, expected, `${path}.${key}`);

  if (value !== expected) {
    throw new Error(`${path}.${key} must be ${expected}`);
  }

  return expected as 1;
};

const readOptionalInteger = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number | undefined =>
  value === undefined ? undefined : readInteger(value, min, max, path);

const readInteger = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number => {
  const numberValue = readNumber(value, min, max, path);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${path} must be an integer`);
  }

  return numberValue;
};

const readNumber = (
  value: unknown,
  min: number,
  max: number,
  path: string,
): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(`${path} must be between ${min} and ${max}`);
  }

  return value;
};

const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];
