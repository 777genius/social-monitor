import type { SourceMixEntry } from "./source-mix-entry";
import type { ReaderSummaryCitation } from "./citation";
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
  citationById?: ReadonlyMap<string, ReaderSummaryCitation>,
): void => {
  const itemKeys = new Set<string>();

  for (const item of items) {
    const keys = readerItemIdentityKeys(item, citationById);
    for (const key of keys) {
      if (itemKeys.has(key)) {
        throw new Error(`${label} must not repeat the same reader item`);
      }
    }
    for (const key of keys) {
      itemKeys.add(key);
    }
  }
};

export const assertUniqueReaderSummaryContentItems = (
  content: {
    readonly topReads: readonly TopRead[];
    readonly topicSections: readonly {
      readonly items: readonly TopRead[];
    }[];
  },
  citationById: ReadonlyMap<string, ReaderSummaryCitation>,
): void => {
  assertUniqueReaderSummaryItems(
    content.topicSections.flatMap((section) => section.items),
    "Reader summary topic sections",
    citationById,
  );
  assertUniqueReaderSummaryItems(
    content.topReads,
    "Reader summary top reads",
    citationById,
  );
  assertUniqueReaderSummaryItems(
    [
      ...content.topReads,
      ...content.topicSections.flatMap((section) => section.items),
    ],
    "Reader summary content",
    citationById,
  );
};

const readerItemIdentityKeys = (
  item: TopRead,
  citationById: ReadonlyMap<string, ReaderSummaryCitation> | undefined,
): readonly string[] => {
  const canonicalUrlKey = normalizeReaderCanonicalUrlKey(item.canonicalUrl);
  const citationKeys =
    citationById === undefined
      ? []
      : item.citationIds
          .map((citationId) =>
            normalizeReaderCanonicalUrlKey(
              citationById.get(citationId)?.canonicalUrl,
            ),
          )
          .filter((key): key is string => key !== undefined);

  return uniqueIdentityKeys([
    canonicalUrlKey ??
      `provider-title:${normalizeIdentityText(item.providerKey)}:${normalizeIdentityText(item.title)}`,
    ...citationKeys,
  ]);
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

const uniqueIdentityKeys = (keys: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const key of keys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(key);
  }

  return result;
};
