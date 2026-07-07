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

  return titleCaseTopicLabel(humanizeSlug(rawValue));
};

const titleCaseTopicLabel = (value: string): string =>
  value
    .split(/\s+/u)
    .filter((part) => part.length > 0)
    .map(
      (part) => `${part.charAt(0).toLocaleUpperCase("en-US")}${part.slice(1)}`,
    )
    .join(" ");
