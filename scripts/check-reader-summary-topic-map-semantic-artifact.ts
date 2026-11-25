import { readFileSync } from "node:fs";

import {
  evaluateReaderSummaryTopicSemantics,
  type ReaderSummaryTopicMap,
  type ReaderSummaryTopicSemanticExpectation,
} from "@social-monitor/summary/domain";

import {
  assertReaderSummarySemanticCorpusMatches,
  buildReaderSummarySemanticCorpusContract,
  type ReaderSummarySemanticCorpusContract,
} from "./lib/reader-summary-semantic-corpus";

function main(): void {
  const artifactPath = optionValue("--path");
  if (artifactPath === undefined) {
    throw new Error("--path <reader-summary-artifact.json> is required");
  }
  const goldPath =
    optionValue("--gold") ??
    "ops/evals/reader-summary-topic-map-semantic-gold.v1.json";
  const artifact = readArtifact(artifactPath);
  const gold = readGold(goldPath);
  const periodDate = artifact.periodStartedAt.slice(0, 10);
  if (periodDate !== gold.collectionDate) {
    throw new Error(
      `Semantic gold date ${gold.collectionDate} does not match artifact period ${periodDate}`,
    );
  }
  const actualCorpus = buildReaderSummarySemanticCorpusContract(
    artifact.selectedFeedItemIds,
  );
  assertReaderSummarySemanticCorpusMatches({
    actual: actualCorpus,
    expected: gold.corpus,
  });
  const evaluation = evaluateReaderSummaryTopicSemantics({
    storyClusters: artifact.storyClusters,
    topicMap: artifact.topicMap,
    expectations: gold.expectations,
  });
  const report = {
    artifactFormat: "reader-summary-topic-map-semantic-artifact-check-v1",
    inputPath: artifactPath,
    goldPath,
    collectionDate: gold.collectionDate,
    corpus: actualCorpus,
    ...evaluation,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) {
    process.exitCode = 1;
  }
}

const readArtifact = (path: string) => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  const root =
    isRecord(parsed) && Array.isArray(parsed.items) ? parsed.items[0] : parsed;
  if (!isRecord(root)) {
    throw new Error("Input JSON does not contain a reader summary artifact");
  }
  const readerBrief = isRecord(root.readerBrief) ? root.readerBrief : undefined;
  const content = isRecord(root.content) ? root.content : readerBrief;
  const topicMap = content?.topicMap;
  if (!isTopicMap(topicMap) || !Array.isArray(root.storyClusters)) {
    throw new Error("Input JSON does not contain story clusters and topic map");
  }
  const period = isRecord(root.period) ? root.period : undefined;
  const periodStartedAt = stringValue(period?.startedAt);
  if (periodStartedAt === undefined) {
    throw new Error("Input JSON does not contain a reader summary period");
  }

  return {
    periodStartedAt,
    selectedFeedItemIds: stringArray(root.sourceWindow, "selectedFeedItemIds"),
    storyClusters: root.storyClusters.filter(isStoryCluster),
    topicMap,
  };
};

const readGold = (
  path: string,
): {
  readonly collectionDate: string;
  readonly corpus: ReaderSummarySemanticCorpusContract;
  readonly expectations: readonly ReaderSummaryTopicSemanticExpectation[];
} => {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(parsed) || !Array.isArray(parsed.expectations)) {
    throw new Error("Semantic gold JSON is invalid");
  }
  const collectionDate = stringValue(parsed.collectionDate);
  if (collectionDate === undefined) {
    throw new Error("Semantic gold collectionDate is required");
  }
  const corpus = isRecord(parsed.corpus) ? parsed.corpus : undefined;
  const selectedFeedItemCount = numberValue(corpus?.selectedFeedItemCount);
  const selectedFeedItemFingerprint = stringValue(
    corpus?.selectedFeedItemFingerprint,
  );
  if (
    selectedFeedItemCount === undefined ||
    selectedFeedItemFingerprint === undefined
  ) {
    throw new Error("Semantic gold corpus contract is required");
  }

  return {
    collectionDate,
    corpus: { selectedFeedItemCount, selectedFeedItemFingerprint },
    expectations:
      parsed.expectations as readonly ReaderSummaryTopicSemanticExpectation[],
  };
};

const isTopicMap = (value: unknown): value is ReaderSummaryTopicMap =>
  isRecord(value) && value.schemaVersion === "reader_summary.topic_map.v1";

const isStoryCluster = (
  value: unknown,
): value is {
  readonly id: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds: readonly string[];
} =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.representativeFeedItemId === "string" &&
  Array.isArray(value.duplicateFeedItemIds) &&
  value.duplicateFeedItemIds.every((item) => typeof item === "string");

const optionValue = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  const value = index < 0 ? undefined : process.argv[index + 1]?.trim();

  return value === undefined || value.length === 0 ? undefined : value;
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const numberValue = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;

const stringArray = (value: unknown, key: string): readonly string[] => {
  if (!isRecord(value) || !Array.isArray(value[key])) {
    throw new Error(`Input JSON does not contain sourceWindow.${key}`);
  }
  const items = value[key];
  if (!items.every((item) => typeof item === "string")) {
    throw new Error(`Input JSON sourceWindow.${key} must contain strings`);
  }

  return items;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

main();
