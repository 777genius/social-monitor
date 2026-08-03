import {
  assertReaderSummaryWeeklyDenseArray,
  assertReaderSummaryWeeklyExactObject,
  deepFreezeReaderSummaryWeekly,
  exactReaderSummaryWeeklyIdentity,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-canonical-json";
import {
  readerSummaryWeeklyReviewResponseSchemaVersion,
  type ReaderSummaryWeeklyReviewLabel,
  type ReaderSummaryWeeklyReviewSelection,
} from "../../libs/summary/domain/value-objects/reader-summary-weekly-review-manifest";

export const readerSummaryWeeklyReviewResponseJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "selections"],
  properties: {
    schemaVersion: { const: readerSummaryWeeklyReviewResponseSchemaVersion },
    selections: {
      type: "array",
      maxItems: 64,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["story", "label", "citationSelectors"],
        properties: {
          story: { type: "string", pattern: "^story:[0-9a-f]{64}$" },
          label: { enum: ["observation", "evolution", "resolution"] },
          citationSelectors: {
            type: "array",
            minItems: 1,
            maxItems: 7,
            items: { type: "string", pattern: "^citation:[0-9a-f]{64}$" },
          },
          beforeCitationSelector: {
            type: "string",
            pattern: "^citation:[0-9a-f]{64}$",
          },
          afterCitationSelector: {
            type: "string",
            pattern: "^citation:[0-9a-f]{64}$",
          },
          terminalCitationSelector: {
            type: "string",
            pattern: "^citation:[0-9a-f]{64}$",
          },
        },
      },
    },
  },
} as const);

const responseKeys = ["schemaVersion", "selections"] as const;
const selectionBaseKeys = ["story", "label", "citationSelectors"] as const;

export const parseReaderSummaryWeeklyReviewResponse = (
  input: unknown,
): readonly ReaderSummaryWeeklyReviewSelection[] => {
  assertReaderSummaryWeeklyExactObject(
    input,
    responseKeys,
    "weekly review model response",
  );
  const response = input as Readonly<Record<string, unknown>>;
  if (response.schemaVersion !== readerSummaryWeeklyReviewResponseSchemaVersion) {
    throw new Error("Reader summary weekly review response schema is invalid");
  }
  assertReaderSummaryWeeklyDenseArray(
    response.selections,
    "weekly review model selections",
  );
  if (response.selections.length > 64) {
    throw new Error("Reader summary weekly review model selections are not bounded");
  }
  return deepFreezeReaderSummaryWeekly(
    response.selections.map((selection) => parseSelection(selection)),
  );
};

const parseSelection = (
  input: unknown,
): ReaderSummaryWeeklyReviewSelection => {
  const record = asRecord(input, "weekly review model selection");
  const label = exactLabel(record.label);
  const expectedKeys = label === "evolution"
    ? [...selectionBaseKeys, "beforeCitationSelector", "afterCitationSelector"]
    : label === "resolution"
      ? [...selectionBaseKeys, "terminalCitationSelector"]
      : selectionBaseKeys;
  assertReaderSummaryWeeklyExactObject(
    input,
    expectedKeys,
    "weekly review model selection",
  );
  assertReaderSummaryWeeklyDenseArray(
    record.citationSelectors,
    "weekly review model citation selectors",
  );
  const citationSelectors = record.citationSelectors.map(exactCitationSelector);
  if (
    citationSelectors.length === 0 ||
    citationSelectors.length > 7 ||
    new Set(citationSelectors).size !== citationSelectors.length
  ) {
    throw new Error("Reader summary weekly review model citation selectors are invalid");
  }
  const common = {
    story: exactStorySelector(record.story),
    label,
    citationSelectors,
  } as const;
  if (label === "evolution") {
    return deepFreezeReaderSummaryWeekly({
      ...common,
      beforeCitationSelector: exactCitationSelector(record.beforeCitationSelector),
      afterCitationSelector: exactCitationSelector(record.afterCitationSelector),
    });
  }
  if (label === "resolution") {
    return deepFreezeReaderSummaryWeekly({
      ...common,
      terminalCitationSelector: exactCitationSelector(record.terminalCitationSelector),
    });
  }
  return deepFreezeReaderSummaryWeekly(common);
};

const asRecord = (input: unknown, label: string): Readonly<Record<string, unknown>> => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error(`Reader summary ${label} is invalid`);
  }
  return input as Readonly<Record<string, unknown>>;
};

const exactLabel = (input: unknown): ReaderSummaryWeeklyReviewLabel => {
  if (input === "observation" || input === "evolution" || input === "resolution") {
    return input;
  }
  throw new Error("Reader summary weekly review model label is invalid");
};

const exactStorySelector = (input: unknown): string => {
  const value = exactReaderSummaryWeeklyIdentity(input, "weekly review model story selector");
  if (!/^story:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Reader summary weekly review model story selector is invalid");
  }
  return value;
};

const exactCitationSelector = (input: unknown): string => {
  const value = exactReaderSummaryWeeklyIdentity(input, "weekly review model citation selector");
  if (!/^citation:[0-9a-f]{64}$/u.test(value)) {
    throw new Error("Reader summary weekly review model citation selector is invalid");
  }
  return value;
};
