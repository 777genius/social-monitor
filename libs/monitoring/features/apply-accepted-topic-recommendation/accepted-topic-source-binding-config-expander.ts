import type {
  SourceBindingConfig,
  SourceBindingConfigValue,
} from "../../ports";

export type AcceptedTopicConfigExpansion = {
  readonly config: SourceBindingConfig;
  readonly changed: boolean;
  readonly changedConfigPaths: readonly string[];
};

export const expandConfigForAcceptedTopic = (
  providerKey: string,
  config: SourceBindingConfig,
  topicLabel: string,
): AcceptedTopicConfigExpansion => {
  const topic = topicLabel.trim();
  const withPromotedTopic = appendPromotedTopic(config, topic);
  const providerExpansion = providerSpecificExpansion(
    providerKey,
    withPromotedTopic.config,
    topic,
  );
  const changedConfigPaths = uniqueNormalized([
    ...withPromotedTopic.changedConfigPaths,
    ...providerExpansion.changedConfigPaths,
  ]);

  return {
    config: providerExpansion.config,
    changed: changedConfigPaths.length > 0,
    changedConfigPaths,
  };
};

const providerSpecificExpansion = (
  providerKey: string,
  config: SourceBindingConfig,
  topic: string,
): {
  readonly config: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
} => {
  if (providerKey === "reddit") {
    return appendScanPass(config, redditSearchPass(topic), "scanPasses");
  }

  if (providerKey === "hacker-news") {
    const story = appendScanPass(
      config,
      hackerNewsSearchPass(topic, "story"),
      "scanPasses",
    );
    return appendScanPass(
      story.config,
      hackerNewsSearchPass(topic, "comment"),
      "scanPasses",
    );
  }

  if (providerKey === "x-twitter") {
    return appendStringArrayValue(config, "searchQueries", topic, {
      maxSearchQueries: 16,
    });
  }

  if (providerKey === "rss") {
    return appendStringArrayValue(
      config,
      "extraFeedUrls",
      googleNewsFeedUrl(topic),
    );
  }

  return { config, changedConfigPaths: [] };
};

const appendPromotedTopic = (
  config: SourceBindingConfig,
  topic: string,
): {
  readonly config: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
} => appendStringArrayValue(config, "promotedTopics", topic);

const appendScanPass = (
  config: SourceBindingConfig,
  pass: SourceBindingConfig,
  path: string,
): {
  readonly config: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
} => {
  const current = readRecordArray(config[path]);
  const exists = current.some(
    (entry) => scanPassKey(entry) === scanPassKey(pass),
  );

  if (exists) {
    return { config, changedConfigPaths: [] };
  }

  return {
    config: {
      ...config,
      [path]: [...current, pass],
    },
    changedConfigPaths: [path],
  };
};

const appendStringArrayValue = (
  config: SourceBindingConfig,
  path: string,
  value: string,
  options: { readonly maxSearchQueries?: number } = {},
): {
  readonly config: SourceBindingConfig;
  readonly changedConfigPaths: readonly string[];
} => {
  const current = readStringArray(config[path]);
  const normalized = value.trim();

  if (current.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
    return { config, changedConfigPaths: [] };
  }

  const nextConfig: SourceBindingConfig = {
    ...config,
    [path]: [...current, normalized],
  };

  if (options.maxSearchQueries !== undefined && path === "searchQueries") {
    return {
      config: {
        ...nextConfig,
        maxSearchQueries: Math.min(
          options.maxSearchQueries,
          Math.max(readInteger(config.maxSearchQueries, 8), current.length + 1),
        ),
      },
      changedConfigPaths: [path, "maxSearchQueries"],
    };
  }

  return { config: nextConfig, changedConfigPaths: [path] };
};

const redditSearchPass = (topic: string): SourceBindingConfig => ({
  mode: "search",
  query: topic,
  maxItems: 30,
  minScore: 1,
  includeComments: true,
  maxCommentsPerPost: 5,
});

const hackerNewsSearchPass = (
  topic: string,
  target: "story" | "comment",
): SourceBindingConfig => ({
  mode: "search",
  target,
  query: topic,
  maxItems: 20,
});

const googleNewsFeedUrl = (topic: string): string => {
  const query = encodeURIComponent(`"${topic}" when:1d`);

  return `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
};

const scanPassKey = (pass: SourceBindingConfig): string => {
  const mode = readString(pass.mode).toLowerCase();
  const query = readString(
    pass.query ?? pass.term ?? pass.subreddit,
  ).toLowerCase();
  const target = readString(pass.target ?? pass.listing).toLowerCase();

  return `${mode}:${target}:${query}`;
};

const readRecordArray = (
  value: SourceBindingConfigValue | undefined,
): readonly SourceBindingConfig[] =>
  Array.isArray(value)
    ? value.flatMap((item) => (isRecord(item) ? [item] : []))
    : [];

const readStringArray = (
  value: SourceBindingConfigValue | undefined,
): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((item) =>
        typeof item === "string" && item.trim().length > 0 ? [item.trim()] : [],
      )
    : [];

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const readInteger = (value: unknown, fallback: number): number =>
  Number.isInteger(value) ? Number(value) : fallback;

const uniqueNormalized = (values: readonly string[]): readonly string[] => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

const isRecord = (value: unknown): value is SourceBindingConfig =>
  value !== null && typeof value === "object" && !Array.isArray(value);
