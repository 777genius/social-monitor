import type { SourceMixEntry } from "./source-mix-entry";
import type { TopRead } from "./top-read";

export const assertUniqueReaderSummarySourceMixProviders = (
  sourceMix: readonly SourceMixEntry[],
): void => {
  const providerKeys = new Set<string>();

  for (const source of sourceMix) {
    const key = source.providerKey.trim().toLowerCase();
    if (providerKeys.has(key)) {
      throw new Error(
        "Reader summary source mix provider keys must be unique",
      );
    }
    providerKeys.add(key);
  }
};

export const assertUniqueReaderSummaryItems = (
  items: readonly TopRead[],
  label: string,
): void => {
  const itemKeys = new Set<string>();

  for (const item of items) {
    const key = readerItemIdentityKey(item);
    if (itemKeys.has(key)) {
      throw new Error(`${label} must not repeat the same reader item`);
    }
    itemKeys.add(key);
  }
};

const readerItemIdentityKey = (item: TopRead): string => {
  const canonicalUrlKey = normalizeReaderCanonicalUrlKey(item.canonicalUrl);

  return (
    canonicalUrlKey ??
    `provider-title:${normalizeIdentityText(item.providerKey)}:${normalizeIdentityText(item.title)}`
  );
};

const normalizeReaderCanonicalUrlKey = (
  value: string | undefined,
): string | undefined => {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    for (const parameter of [...parsed.searchParams.keys()]) {
      const normalized = parameter.toLowerCase();
      if (
        normalized.startsWith("utm_") ||
        normalized === "fbclid" ||
        normalized === "gclid" ||
        normalized === "igshid" ||
        normalized === "mc_cid" ||
        normalized === "mc_eid" ||
        (parsed.hostname === "github.com" && normalized === "ref")
      ) {
        parsed.searchParams.delete(parameter);
      }
    }

    const githubRepositoryKey = githubRepositoryIdentityKey(parsed);
    if (githubRepositoryKey !== undefined) {
      return githubRepositoryKey;
    }

    parsed.pathname = normalizeIdentityPathname(parsed.pathname);

    return parsed.toString().replace(/\/$/, "");
  } catch {
    return `url:${normalizeIdentityText(trimmed)}`;
  }
};

const githubRepositoryIdentityKey = (url: URL): string | undefined => {
  if (url.hostname !== "github.com") {
    return undefined;
  }
  const [owner, repo] = url.pathname
    .split("/")
    .filter((segment) => segment.length > 0);

  return owner === undefined || repo === undefined
    ? undefined
    : `github:${owner.toLowerCase()}/${repo.toLowerCase()}`;
};

const normalizeIdentityPathname = (pathname: string): string => {
  const normalized = pathname.replace(/\/+$/, "");

  return normalized.length === 0 ? "/" : normalized;
};

const normalizeIdentityText = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();
