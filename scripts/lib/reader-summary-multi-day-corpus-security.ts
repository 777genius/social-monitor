import { realpathSync } from "node:fs";
import {
  basename,
  dirname,
  join,
  resolve,
} from "node:path";

import { assertPathOutsideGitWorktrees } from "./private-evaluation-file";

type SecretPattern = {
  readonly label: string;
  readonly source: string;
};

const highConfidenceSecretPatterns: readonly SecretPattern[] = [
  {
    label: "GitHub personal access token",
    source: String.raw`\b(?:gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})\b`,
  },
  {
    label: "OpenAI API key",
    source: String.raw`\bsk-(?:proj|live)-[A-Za-z0-9_-]{10,255}\b`,
  },
  {
    label: "legacy OpenAI API key",
    source: String.raw`\bsk-[A-Za-z0-9]{32,}\b`,
  },
  {
    label: "JSON web token",
    source: String.raw`\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b`,
  },
  {
    label: "AWS access key",
    source: String.raw`\b(?:AKIA|ASIA)[A-Z0-9]{16}\b`,
  },
  {
    label: "Slack token",
    source: String.raw`\bxox[baprs]-[A-Za-z0-9-]{10,}\b`,
  },
  {
    label: "Social Monitor API key",
    source: String.raw`\bsmk_[A-Za-z0-9._-]{16,}\b`,
  },
  {
    label: "Social Monitor webhook secret",
    source: String.raw`\bwhsec_[A-Za-z0-9._-]{16,}\b`,
  },
  {
    label: "credential assignment",
    source: String.raw`\b(?:password|passwd|pwd|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)\s*[:=]\s*(?:"[^"\r\n]{4,}"|'[^'\r\n]{4,}'|[^\s,;]{4,})`,
  },
  {
    label: "bearer credential",
    source: String.raw`\b(?:authorization\s*[:=]\s*)?bearer\s+[A-Za-z0-9._~+/=-]{8,}`,
  },
  {
    label: "credential-bearing URL",
    source: String.raw`\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@[^\s]+`,
  },
  {
    label: "private connection URL",
    source: String.raw`\b(?:postgres(?:ql)?|amqps?|mysql|rediss?):\/\/[^\s"'<>]+`,
  },
  {
    label: "authorization credential",
    source: String.raw`\bauthorization\s*[:=]\s*(?:basic|bearer|token)\s+[A-Za-z0-9._~+/=-]{8,}`,
  },
  {
    label: "cookie credential",
    source: String.raw`\bcookie\s*:\s*[A-Za-z0-9_.-]+=[^;\s]{8,}`,
  },
  {
    label: "private key",
    source: String.raw`-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----`,
  },
];

const sensitiveUrlPathLabels = new Set([
  "access-token",
  "access_token",
  "api-key",
  "api_key",
  "apikey",
  "auth",
  "invite",
  "invites",
  "oauth",
  "reset",
  "reset-password",
  "secret",
  "secrets",
  "signature",
  "signed",
  "token",
  "tokens",
  "verification",
  "verify",
]);

const urlPathSecretPattern: SecretPattern = {
  label: "URL path secret",
  source: String.raw`https?:\/\/[^\s"?#]*\/(?:access-token|access_token|api-key|api_key|apikey|auth|invite|invites|oauth|reset|reset-password|secret|secrets|signature|signed|token|tokens|verification|verify)\/(?!redacted(?:[\s"/?#]|$))[A-Za-z0-9._~+%=-]{8,}`,
};

export function assertPrivateCorpusOutputOutsideGitWorktree(
  outputPath: string,
  cwd = process.cwd(),
): void {
  const resolvedOutputPath = resolveOutputPath(outputPath, cwd);
  assertPathOutsideGitWorktrees(
    resolvedOutputPath,
    "Private evaluation corpus",
  );
}

export function assertPrivateCorpusFileOutsideGitWorktree(
  corpusPath: string,
): void {
  assertPathOutsideGitWorktrees(
    realpathSync(corpusPath),
    "Private evaluation corpus",
  );
}

export function redactPrivateCorpusText(value: string): string {
  return replaceHighConfidenceSecrets(value);
}

export function sanitizePrivateCorpusUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return undefined;
    }
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    redactUrlPathSecrets(url);
    const sanitized = url.toString().slice(0, 2_000);
    return findHighConfidenceSecret(sanitized) !== undefined
      ? undefined
      : sanitized;
  } catch {
    return undefined;
  }
}

export function assertPrivateCorpusSerializedSafe(value: unknown): void {
  const highConfidenceSecret = findSerializedHighConfidenceSecret(value);
  if (highConfidenceSecret !== undefined) {
    throw new Error(
      `Corpus contains high-confidence secret: ${highConfidenceSecret}`,
    );
  }
}

export function findSerializedHighConfidenceSecret(
  value: unknown,
): string | undefined {
  for (const stringValue of collectStringValues(value)) {
    const highConfidenceSecret = findHighConfidenceSecret(stringValue);
    if (highConfidenceSecret !== undefined) {
      return highConfidenceSecret;
    }
  }
  return undefined;
}

function collectStringValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.values(value).flatMap(collectStringValues);
}

function replaceHighConfidenceSecrets(value: string): string {
  return highConfidenceSecretPatterns.reduce(
    (current, pattern) =>
      current.replace(new RegExp(pattern.source, "gi"), "[redacted]"),
    value,
  );
}

function findHighConfidenceSecret(value: string): string | undefined {
  return [...highConfidenceSecretPatterns, urlPathSecretPattern].find(
    (candidate) => new RegExp(candidate.source, "i").test(value),
  )?.label;
}

function redactUrlPathSecrets(url: URL): void {
  const segments = url.pathname.split("/");
  for (let index = 0; index < segments.length; index += 1) {
    const segment = safelyDecodeUrlSegment(segments[index] ?? "");
    const previous = safelyDecodeUrlSegment(segments[index - 1] ?? "")
      .trim()
      .toLowerCase();
    if (
      replaceHighConfidenceSecrets(segment) !== segment ||
      (sensitiveUrlPathLabels.has(previous) && segment.length >= 8)
    ) {
      segments[index] = "redacted";
    }
  }
  url.pathname = segments.join("/");
}

function safelyDecodeUrlSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolveOutputPath(outputPath: string, cwd: string): string {
  const absoluteOutputPath = resolve(cwd, outputPath);
  return join(
    realpathSync(dirname(absoluteOutputPath)),
    basename(absoluteOutputPath),
  );
}
