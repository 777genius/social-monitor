export const compactLabel = (value: string): string =>
  value
    .replace(/^summary:\s*/iu, "")
    .replace(/^x\s+post\s+by\s+@[^:]+:\s*/iu, "")
    .replace(/^(?:ask|show)\s+hn:\s*/iu, "")
    .replace(/^(?:why|how|what|when|where|who|should|could|would)\s+/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 56) || "Untitled topic";

export const compactOptional = (
  value: string | undefined,
): string | undefined => {
  const trimmed = value?.replace(/\s+/gu, " ").trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export const compactId = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
};

export const humanizeSlug = (value: string): string =>
  value.replace(/[-_]+/gu, " ");

export const readerSummaryTopicLabelFromSlug = (value: string): string =>
  humanizeSlug(value)
    .split(/\s+/u)
    .filter(Boolean)
    .map(formatReaderSummaryTopicToken)
    .join(" ");

export const canonicalizeReaderSummaryTopicAcronyms = (value: string): string =>
  value
    .split(/(\s+)/u)
    .map((token) => {
      const normalized = normalizeTopicLabel(token).replace(/\s+/gu, "");
      return canonicalTopicTokens[normalized] ?? token;
    })
    .join("");

export const formatReaderSummaryTopicToken = (value: string): string => {
  const normalized = normalizeTopicLabel(value).replace(/\s+/gu, "");
  const canonical = canonicalTopicTokens[normalized];
  if (canonical !== undefined) {
    return canonical;
  }
  if (/^gpt\d+/u.test(normalized)) {
    return value.toLocaleUpperCase("en-US");
  }
  if (/[A-Z]/u.test(value.slice(1))) {
    return value;
  }

  return `${value.charAt(0).toLocaleUpperCase("en-US")}${value
    .slice(1)
    .toLocaleLowerCase("en-US")}`;
};

export const normalizeTopicLabel = (value: string): string =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

export const slug = (value: string): string =>
  value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "unknown";

export const fallbackTopicFamilyGroupId = (topicId: string): string => {
  if (topicId.startsWith("topic:claude-")) {
    return "topic:claude";
  }
  if (topicId.startsWith("topic:openai-")) {
    return "topic:openai";
  }
  if (topicId.startsWith("topic:github-")) {
    return "topic:github";
  }

  return topicId;
};

export const fallbackTopicLabel = (topicId: string): string => {
  const [, rawValue = topicId] = topicId.split(":");
  if (rawValue === "claude") {
    return "Claude ecosystem";
  }
  if (rawValue === "openai") {
    return "OpenAI ecosystem";
  }
  if (rawValue === "github") {
    return "GitHub ecosystem";
  }

  return readerSummaryTopicLabelFromSlug(rawValue);
};

const canonicalTopicTokens: Readonly<Record<string, string>> = {
  ai: "AI",
  chatgpt: "ChatGPT",
  github: "GitHub",
  llm: "LLM",
  llms: "LLM",
  mcp: "MCP",
  openai: "OpenAI",
  xai: "xAI",
};
