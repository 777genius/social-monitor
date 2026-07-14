import {
  evaluateReaderSummaryArtifactEditorialQuality,
  type ReaderSummaryArtifactEditorialQualityInput,
  type ReaderSummaryArtifactEditorialQualityResult,
  type ReaderSummaryEditorialCitationSupport,
  type ReaderSummaryEditorialNarrativeSection,
} from "@social-monitor/summary/domain";

import { noRawSecretFragments } from "./yesterday-social-replay-support";

export type ReaderSummaryEditorialQualityFixture = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-editorial-quality-fixture-v1";
  readonly fixtureKind: "sanitized_placeholder" | "sanitized_public_artifact";
  readonly days: readonly ReaderSummaryEditorialQualityFixtureDay[];
};

export type ReaderSummaryEditorialQualityFixtureDay = {
  readonly collectionDate: string;
  readonly input: ReaderSummaryArtifactEditorialQualityInput;
};

export type ReaderSummaryEditorialQualityReport = {
  readonly schemaVersion: 1;
  readonly artifactFormat: "reader-summary-editorial-quality-report-v1";
  readonly generatedBy: "npm run check:reader-summary-editorial-quality";
  readonly model: {
    readonly liveNetwork: false;
    readonly tokenFree: true;
    readonly rawPostTextPersistedInReport: false;
    readonly rawProviderPayloadPersistedInReport: false;
    readonly finalSummaryTextPersistedInReport: false;
  };
  readonly inputs: {
    readonly fixturePath: string;
    readonly fixtureKind: ReaderSummaryEditorialQualityFixture["fixtureKind"];
    readonly collectionDates: readonly string[];
  };
  readonly days: readonly {
    readonly collectionDate: string;
    readonly metrics: ReaderSummaryArtifactEditorialQualityResult["metrics"];
    readonly qualityGates: ReaderSummaryArtifactEditorialQualityResult["qualityGates"];
    readonly issues: readonly string[];
    readonly blockingPassed: boolean;
  }[];
  readonly qualityGates: {
    readonly fixtureHasAtLeastTwoDays: boolean;
    readonly collectionDatesAreUnique: boolean;
    readonly everyDayPassesEditorialPolicy: boolean;
    readonly noRawSecretFragments: boolean;
  };
  readonly blockingPassed: boolean;
};

const coverageModes: ReadonlySet<string> = new Set([
  "single_story",
  "daily_synthesis",
]);
const narrativeKinds: ReadonlySet<string> = new Set([
  "lead",
  "main_signal",
  "why_it_matters",
  "secondary_signal",
  "watch",
]);

export const parseReaderSummaryEditorialQualityFixture = (
  value: unknown,
): ReaderSummaryEditorialQualityFixture => {
  if (!noRawSecretFragments(value)) {
    throw new Error("Editorial quality fixture contains a secret fragment");
  }
  const root = record(value, "fixture");
  assertAllowedKeys(
    root,
    ["schemaVersion", "artifactFormat", "fixtureKind", "days"],
    "fixture",
  );
  if (
    root.schemaVersion !== 1 ||
    root.artifactFormat !== "reader-summary-editorial-quality-fixture-v1"
  ) {
    throw new Error("Editorial quality fixture contract is unsupported");
  }
  if (
    root.fixtureKind !== "sanitized_placeholder" &&
    root.fixtureKind !== "sanitized_public_artifact"
  ) {
    throw new Error("Editorial quality fixtureKind is unsupported");
  }
  const days = array(root.days, "fixture.days").map((day, index) =>
    parseDay(day, index),
  );
  if (days.length === 0) {
    throw new Error("Editorial quality fixture must include at least one day");
  }

  return {
    schemaVersion: 1,
    artifactFormat: "reader-summary-editorial-quality-fixture-v1",
    fixtureKind: root.fixtureKind,
    days,
  };
};

export const buildReaderSummaryEditorialQualityReport = (params: {
  readonly fixture: ReaderSummaryEditorialQualityFixture;
  readonly fixturePath: string;
}): ReaderSummaryEditorialQualityReport => {
  const days = params.fixture.days.map((day) => ({
    collectionDate: day.collectionDate,
    ...evaluateReaderSummaryArtifactEditorialQuality(day.input),
  }));
  const collectionDates = days.map((day) => day.collectionDate);
  const reportWithoutSecretGate = {
    schemaVersion: 1,
    artifactFormat: "reader-summary-editorial-quality-report-v1",
    generatedBy: "npm run check:reader-summary-editorial-quality",
    model: {
      liveNetwork: false,
      tokenFree: true,
      rawPostTextPersistedInReport: false,
      rawProviderPayloadPersistedInReport: false,
      finalSummaryTextPersistedInReport: false,
    },
    inputs: {
      fixturePath: params.fixturePath,
      fixtureKind: params.fixture.fixtureKind,
      collectionDates,
    },
    days,
    qualityGates: {
      fixtureHasAtLeastTwoDays: days.length >= 2,
      collectionDatesAreUnique:
        new Set(collectionDates).size === collectionDates.length,
      everyDayPassesEditorialPolicy: days.every((day) => day.blockingPassed),
      noRawSecretFragments: true,
    },
    blockingPassed: false,
  } as const;
  const qualityGates = {
    ...reportWithoutSecretGate.qualityGates,
    noRawSecretFragments: noRawSecretFragments(reportWithoutSecretGate),
  };

  return {
    ...reportWithoutSecretGate,
    qualityGates,
    blockingPassed: Object.values(qualityGates).every(Boolean),
  };
};

const parseDay = (
  value: unknown,
  index: number,
): ReaderSummaryEditorialQualityFixtureDay => {
  const label = `fixture.days[${index}]`;
  const day = record(value, label);
  assertAllowedKeys(day, ["collectionDate", "input"], label);
  const collectionDate = nonEmptyString(
    day.collectionDate,
    `${label}.collectionDate`,
  );
  assertCollectionDate(collectionDate);

  return {
    collectionDate,
    input: parsePolicyInput(day.input, `${label}.input`),
  };
};

const parsePolicyInput = (
  value: unknown,
  label: string,
): ReaderSummaryArtifactEditorialQualityInput => {
  const input = record(value, label);
  assertAllowedKeys(
    input,
    [
      "headline",
      "coverageMode",
      "topPostTitles",
      "citations",
      "narrativeSections",
      "renderedMarkdown",
    ],
    label,
  );
  const coverageMode = nonEmptyString(
    input.coverageMode,
    `${label}.coverageMode`,
  );
  if (!coverageModes.has(coverageMode)) {
    throw new Error(`${label}.coverageMode is unsupported`);
  }
  const citations = array(input.citations, `${label}.citations`).map(
    (citation, index) =>
      parseCitation(citation, `${label}.citations[${index}]`),
  );
  const citationIds = citations.map((citation) => citation.citationId);
  if (new Set(citationIds).size !== citationIds.length) {
    throw new Error(`${label}.citations contains duplicate citationId values`);
  }

  return {
    headline: nonEmptyString(input.headline, `${label}.headline`),
    coverageMode:
      coverageMode as ReaderSummaryArtifactEditorialQualityInput["coverageMode"],
    topPostTitles: nonEmptyStringArray(
      input.topPostTitles,
      `${label}.topPostTitles`,
    ),
    citations,
    narrativeSections: array(
      input.narrativeSections,
      `${label}.narrativeSections`,
    ).map((section, index) =>
      parseNarrativeSection(section, `${label}.narrativeSections[${index}]`),
    ),
    renderedMarkdown: nonEmptyString(
      input.renderedMarkdown,
      `${label}.renderedMarkdown`,
    ),
  };
};

const parseCitation = (
  value: unknown,
  label: string,
): ReaderSummaryEditorialCitationSupport => {
  const citation = record(value, label);
  assertAllowedKeys(
    citation,
    ["citationId", "providerKey", "storyClusterId"],
    label,
  );
  const storyClusterId = optionalNonEmptyString(
    citation.storyClusterId,
    `${label}.storyClusterId`,
  );

  return {
    citationId: nonEmptyString(citation.citationId, `${label}.citationId`),
    providerKey: nonEmptyString(citation.providerKey, `${label}.providerKey`),
    ...(storyClusterId === undefined ? {} : { storyClusterId }),
  };
};

const parseNarrativeSection = (
  value: unknown,
  label: string,
): ReaderSummaryEditorialNarrativeSection => {
  const section = record(value, label);
  assertAllowedKeys(
    section,
    ["kind", "title", "text", "citationIds", "storyClusterId"],
    label,
  );
  const kind = nonEmptyString(section.kind, `${label}.kind`);
  if (!narrativeKinds.has(kind)) {
    throw new Error(`${label}.kind is unsupported`);
  }
  const storyClusterId = optionalNonEmptyString(
    section.storyClusterId,
    `${label}.storyClusterId`,
  );

  return {
    kind: kind as ReaderSummaryEditorialNarrativeSection["kind"],
    title: nonEmptyString(section.title, `${label}.title`),
    text: nonEmptyString(section.text, `${label}.text`),
    citationIds: nonEmptyStringArray(
      section.citationIds,
      `${label}.citationIds`,
    ),
    ...(storyClusterId === undefined ? {} : { storyClusterId }),
  };
};

const assertAllowedKeys = (
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void => {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw new Error(
      `${label} contains unsupported keys: ${unexpected.join(", ")}`,
    );
  }
};

const assertCollectionDate = (value: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error(`collectionDate must use YYYY-MM-DD: ${value}`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`collectionDate is invalid: ${value}`);
  }
};

const record = (
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
};

const array = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  return value;
};

const nonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const optionalNonEmptyString = (
  value: unknown,
  label: string,
): string | undefined =>
  value === undefined ? undefined : nonEmptyString(value, label);

const nonEmptyStringArray = (
  value: unknown,
  label: string,
): readonly string[] =>
  array(value, label).map((item, index) =>
    nonEmptyString(item, `${label}[${index}]`),
  );
