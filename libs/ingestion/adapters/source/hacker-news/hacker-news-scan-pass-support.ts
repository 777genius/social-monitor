import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type { SourceProviderScanContext } from "../../../ports";
import type { HackerNewsListing } from "./hacker-news-client.port";

export type HackerNewsScanPass =
  | {
      readonly mode: "search";
      readonly target: "story" | "comment";
      readonly query: string;
      readonly maxItems?: number;
      readonly requiredKeywords?: readonly string[];
      readonly requiredStoryKeywords?: readonly string[];
    }
  | {
      readonly mode: "listing";
      readonly listing: HackerNewsListing;
      readonly maxItems?: number;
      readonly requiredKeywords?: readonly string[];
      readonly requiredStoryKeywords?: readonly string[];
    };

const supportedListings: readonly HackerNewsListing[] = [
  "top",
  "new",
  "best",
  "ask",
  "show",
  "job",
];

const maxConfiguredHackerNewsScanPasses = 28;

export const readScanPasses = (
  config: SourceProviderScanContext["config"] | undefined,
): readonly HackerNewsScanPass[] =>
  readArray(config?.scanPasses ?? config?.passes)
    .map(readScanPass)
    .slice(0, maxConfiguredHackerNewsScanPasses);

export const sourceKeyForPass = (pass: HackerNewsScanPass): string =>
  pass.mode === "listing" ? pass.listing : `${pass.target}_search`;

export const formatHackerNewsScanPassWarning = (
  pass: HackerNewsScanPass,
  error: unknown,
): string => {
  const passLabel =
    pass.mode === "listing"
      ? `listing:${pass.listing}`
      : `${pass.target}_search:${pass.query}`;
  const message =
    error instanceof Error
      ? error.message
      : "Unknown Hacker News scan pass error";

  return `Hacker News scan pass degraded (${passLabel}): ${redactSensitiveText(message)}`;
};

export const compactUnique = (values: readonly string[]): readonly string[] => [
  ...new Set(values.filter((value) => value.trim().length > 0)),
];

const readScanPass = (value: unknown, index: number): HackerNewsScanPass => {
  const pass = readRecord(value, `scanPasses[${index}]`);
  const mode = readOptionalString(pass.mode) ?? "search";
  const maxItems = readOptionalPositiveInteger(pass.maxItems, 100);

  if (mode === "listing") {
    return {
      mode,
      listing: readListing(pass.listing ?? pass.query),
      ...(maxItems === undefined ? {} : { maxItems }),
      ...readRequiredKeywords(pass),
      ...readRequiredStoryKeywords(pass),
    };
  }

  if (mode === "search") {
    const target = readSearchTarget(
      pass.target ?? pass.contentUnit ?? pass.kind,
    );

    return {
      mode,
      target,
      query: readRequiredString(pass.query, `scanPasses[${index}].query`),
      ...(maxItems === undefined ? {} : { maxItems }),
      ...readRequiredKeywords(pass),
      ...readRequiredStoryKeywords(pass),
    };
  }

  throw new Error(`Unsupported Hacker News scan pass mode: ${mode}`);
};

const readListing = (value: unknown): HackerNewsListing => {
  const listing = readOptionalString(value) ?? "top";

  if (!supportedListings.includes(listing as HackerNewsListing)) {
    throw new Error(`Unsupported Hacker News listing: ${listing}`);
  }

  return listing as HackerNewsListing;
};

const readSearchTarget = (value: unknown): "story" | "comment" => {
  const target = readOptionalString(value) ?? "story";

  if (target === "story" || target === "post") {
    return "story";
  }
  if (target === "comment") {
    return "comment";
  }

  throw new Error(`Unsupported Hacker News search target: ${target}`);
};

const readRequiredKeywords = (
  pass: Readonly<Record<string, unknown>>,
): { readonly requiredKeywords?: readonly string[] } => {
  const raw =
    pass.requiredKeywords ?? pass.includeKeywords ?? pass.requiredTextKeywords;

  if (raw === undefined) {
    return {};
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      "Hacker News source config field requiredKeywords must be an array",
    );
  }

  const requiredKeywords = compactUnique(
    raw.flatMap((value) => {
      const keyword = readOptionalString(value);

      return keyword === undefined ? [] : [keyword];
    }),
  );

  return requiredKeywords.length === 0 ? {} : { requiredKeywords };
};

const readRequiredStoryKeywords = (
  pass: Readonly<Record<string, unknown>>,
): { readonly requiredStoryKeywords?: readonly string[] } => {
  const raw = pass.requiredStoryKeywords ?? pass.includeStoryKeywords;

  if (raw === undefined) {
    return {};
  }

  if (!Array.isArray(raw)) {
    throw new Error(
      "Hacker News source config field requiredStoryKeywords must be an array",
    );
  }

  const requiredStoryKeywords = compactUnique(
    raw.flatMap((value) => {
      const keyword = readOptionalString(value);

      return keyword === undefined ? [] : [keyword];
    }),
  );

  return requiredStoryKeywords.length === 0 ? {} : { requiredStoryKeywords };
};

const readArray = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];

const readRecord = (
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Readonly<Record<string, unknown>>;
  }

  throw new Error(
    `Hacker News source config must provide ${label} as an object`,
  );
};

const readRequiredString = (value: unknown, field: string): string => {
  const resolved = readOptionalString(value);

  if (resolved === undefined) {
    throw new Error(`Hacker News source config field is required: ${field}`);
  }

  return resolved;
};

const readOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;

const readOptionalPositiveInteger = (
  value: unknown,
  max: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    throw new Error(
      `Hacker News source config integer must be between 1 and ${max}`,
    );
  }

  return value;
};
