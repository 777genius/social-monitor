import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type JsonArtifactBinding<T> = {
  readonly value: T;
  readonly sha256: string;
};

export function readJsonArtifactBinding<T>(params: {
  readonly path: string;
  readonly validate: (value: unknown, label: string) => T;
}): JsonArtifactBinding<T> {
  const bytes = readFileSync(params.path);
  const parsed: unknown = JSON.parse(bytes.toString("utf8"));
  return {
    value: params.validate(parsed, params.path),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
