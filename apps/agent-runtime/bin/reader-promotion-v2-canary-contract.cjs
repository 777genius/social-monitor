"use strict";
/* global module */

const readerPromotionV2CanaryPurpose =
  "social_monitor.reader_summary.promotion_v2_canary.v1";
const readerPromotionV2CanarySchemaName =
  "social_monitor_reader_summary_story_relations";
const readerPromotionV2CanarySchemaVersion =
  "reader_summary.story_relation.v1";

const readerPromotionV2CanaryOutputSchema = deepFreeze({
  type: "object",
  additionalProperties: false,
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          leftFeedItemId: { type: "string" },
          rightFeedItemId: { type: "string" },
          sameStory: { type: "boolean" },
          confidenceScore: { type: "number", minimum: 0, maximum: 1 },
          rationale: { type: "string" },
        },
        required: [
          "leftFeedItemId",
          "rightFeedItemId",
          "sameStory",
          "confidenceScore",
          "rationale",
        ],
      },
    },
  },
  required: ["decisions"],
});

const readerPromotionV2CanarySchemaEquals = (value) => {
  try {
    return canonicalJson(value) === canonicalJson(
      readerPromotionV2CanaryOutputSchema,
    );
  } catch {
    return false;
  }
};

const readerPromotionV2CanaryOutputIsValid = (value) =>
  matchesSchema(value, readerPromotionV2CanaryOutputSchema);

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not allow non-finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (recordLike(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  throw new Error("Canonical JSON value is not serializable");
}

function matchesSchema(value, schema) {
  if (schema.type === "object") {
    if (!recordLike(value)) return false;
    const properties = recordLike(schema.properties) ? schema.properties : {};
    if (
      schema.required.some((key) => !Object.hasOwn(value, key)) ||
      Object.keys(value).some((key) => !Object.hasOwn(properties, key))
    ) return false;
    return Object.entries(properties).every(
      ([key, child]) =>
        !Object.hasOwn(value, key) || matchesSchema(value[key], child),
    );
  }
  if (schema.type === "array") {
    return Array.isArray(value) &&
      value.every((item) => matchesSchema(item, schema.items));
  }
  if (schema.type === "string") return typeof value === "string";
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "number") {
    return typeof value === "number" && Number.isFinite(value) &&
      value >= schema.minimum && value <= schema.maximum;
  }
  return false;
}

function recordLike(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") deepFreeze(child);
  }
  return Object.freeze(value);
}

module.exports = {
  readerPromotionV2CanaryOutputIsValid,
  readerPromotionV2CanaryOutputSchema,
  readerPromotionV2CanaryPurpose,
  readerPromotionV2CanarySchemaEquals,
  readerPromotionV2CanarySchemaName,
  readerPromotionV2CanarySchemaVersion,
};
