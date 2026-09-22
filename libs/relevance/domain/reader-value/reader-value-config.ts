import { createHash } from "node:crypto";

import { readerValueQuestions } from "./reader-value-rubric";

export const READER_VALUE_INPUT_VERSION = "reader-value-input.v3";
export const READER_VALUE_MODEL = "typesafe/jev-1.13";
export const READER_VALUE_RESOLVED_MODEL = "typesafe/jev-1.13-20260917";
export const READER_VALUE_MODEL_CONFIG =
  "openrouter-systemone.jev-1.13-20260917.v1";

export const readerValueSha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const READER_VALUE_RUBRIC_SHA256 = readerValueSha256(
  JSON.stringify(readerValueQuestions),
);
