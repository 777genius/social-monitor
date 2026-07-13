export const isConversationalOrTruncatedReaderTitle = (
  value: string,
): boolean => {
  const sourceTitle = value
    .trim()
    .replace(/^X post by @[^:]+:\s*/iu, "")
    .trim();

  return (
    /(?:\.{3,}|…)\s*$/u.test(sourceTitle) ||
    /^(?:well[,\s]+)?here\s+we\s+go\s+again[.!?…]*$/iu.test(sourceTitle) ||
    /\bjust\s+dropped\b/iu.test(sourceTitle) ||
    /\b(?:it(?:'s| is)\s+)?got\s+me\s+thinking\b/iu.test(sourceTitle) ||
    /\bis\s+here[.!?]*$/iu.test(sourceTitle) ||
    /^keep\s+(?:building|going|shipping)\b/iu.test(sourceTitle) ||
    /\bno\s+matter\s+what\b/iu.test(sourceTitle) ||
    /\bwe\s+all\s+know\b/iu.test(sourceTitle) ||
    sourceTitle.length >= 120 ||
    /^(?:what happens when|what if|today i|just\b|here(?:'s| is)\b|i(?:'m| am| have| just)?\b|we(?:'re| are| have| just)?\b)/iu.test(
      sourceTitle,
    )
  );
};

export const isUnpolishedReaderTitle = (value: string): boolean =>
  /^X post by @[^:]+:/iu.test(value.trim()) ||
  isSourceReportedReaderTitle(value) ||
  isLowInformationReaderTitle(value) ||
  hasObviousEnglishAgreementError(value) ||
  isConversationalOrTruncatedReaderTitle(value) ||
  isTechnicalReaderTitle(value);

const hasObviousEnglishAgreementError = (value: string): boolean =>
  /\bAI\s+boosts\s+research\s+careers\s+but\s+narrow\s+the\s+span\s+of\s+ideas\s+explored\b/iu.test(
    value,
  );

const isSourceReportedReaderTitle = (value: string): boolean =>
  /^(?:(?:the|an?|this)\s+)?(?:(?:x(?:\/twitter)?|twitter|reddit|hacker\s+news|hn|rss|github(?:\s+trending)?)\s+)?(?:post|item|story|discussion|source|report)\s+(?:reports?|says?|states?|describes?)\b/iu.test(
    value.trim(),
  );

const isLowInformationReaderTitle = (value: string): boolean => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return (
    /^(?:check (?:this|it) out|take a look|look at this|watch this)$/u.test(
      normalized,
    ) ||
    /^(?:happy|good) (?:coding|building|shipping)(?: this weekend)?(?: [\p{L}\p{N} ]+ fans)?$/u.test(
      normalized,
    ) ||
    /\bmegathread\b/u.test(normalized)
  );
};

export const isTechnicalReaderTitle = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return (
    normalized === "strong source engagement signal" ||
    normalized === "relevant recent source item" ||
    normalized === "current ai product discussion" ||
    normalized === "community discussion on ai product impact" ||
    normalized === "developer discussion on ai engineering trade-offs" ||
    normalized === "ai product and engineering report" ||
    normalized === "ai product and engineering update" ||
    normalized.startsWith("passes source quality") ||
    normalized.startsWith("fresh item in the current monitoring window") ||
    normalized.startsWith("selected to preserve provider coverage")
  );
};

export const isFallbackReaderReason = (value: string | undefined): boolean => {
  const normalized = value?.trim().toLowerCase() ?? "";

  return (
    normalized.length === 0 ||
    isTechnicalReaderReason(normalized) ||
    normalized.startsWith("source-reported:") ||
    /^the discussion(?: with .+)? surfaces practical trade-offs that may affect current ai engineering decisions[.!]?$/u.test(
      normalized,
    ) ||
    /^the discussion(?: with .+)? adds user-experience and operational context that may not appear in the original announcement[.!]?$/u.test(
      normalized,
    ) ||
    /^the post(?: with .+)? is drawing enough attention to shape current discussion around monitored ai products and developer workflows[.!]?$/u.test(
      normalized,
    ) ||
    /^the report(?: with .+)? adds timely context for evaluating monitored ai products and developer workflows[.!]?$/u.test(
      normalized,
    ) ||
    /^the source(?: with .+)? adds timely context for current ai product and engineering decisions[.!]?$/u.test(
      normalized,
    ) ||
    normalized.includes(
      "is a current signal for monitored ai developer topics; its claims remain source-reported",
    )
  );
};

export const readerFacingEvidenceExcerpt = (
  value: string | undefined,
  topicContext = "",
): string | undefined => {
  const normalized = value
    ?.replace(/\(\s*https?:\/\/[^)\s]+\s*\)/giu, "")
    .replace(/https?:\/\/\S+/giu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^(?:and|so)\s+/iu, "");
  if (
    normalized === undefined ||
    normalized.length < 40 ||
    /(?:\.{3,}|…)\s*$/u.test(normalized)
  ) {
    return undefined;
  }

  const completeSentences = normalized
    .split(/(?<=[.!?])\s+/u)
    .filter((sentence) => /[.!?]$/u.test(sentence));
  if (completeSentences.length === 0) {
    return undefined;
  }

  const firstTopicSentenceIndex = completeSentences.findIndex(
    (sentence) =>
      hasReaderFacingTopicSignal(sentence) &&
      !isNarrativePreambleSentence(sentence),
  );
  const firstRelevantIndex =
    firstTopicSentenceIndex >= 0
      ? firstTopicSentenceIndex
      : hasReaderFacingTopicSignal(topicContext)
        ? completeSentences.findIndex(
            (sentence) => !isNarrativePreambleSentence(sentence),
          )
        : -1;
  if (firstRelevantIndex < 0) {
    return undefined;
  }

  const selected: string[] = [];
  for (const sentence of completeSentences.slice(
    firstRelevantIndex,
    firstRelevantIndex + 2,
  )) {
    const candidate = [...selected, sentence].join(" ");
    if (candidate.length > 320) {
      break;
    }
    selected.push(sentence);
    if (candidate.length >= 80) {
      break;
    }
  }

  const excerpt = selected.join(" ").trim();
  return excerpt.length >= 40 &&
    !isTechnicalReaderReason(excerpt) &&
    !isGenericEvidenceExcerpt(excerpt) &&
    !isLowInformationEvidenceExcerpt(excerpt)
    ? excerpt
    : undefined;
};

const isGenericEvidenceExcerpt = (value: string): boolean =>
  /^(?:a|the|this) source (?:post|item|report) (?:covers|describes|discusses|reports|states)\b/iu.test(
    value.trim(),
  );

const hasReaderFacingTopicSignal = (value: string): boolean =>
  /\b(?:ai|agentic|agents?|anthropic|chatgpt|claude|codex|cursor|fable|gemini|gpt(?:-|\b)|llms?|machine learning|mcp|openai)\b/iu.test(
    value,
  );

const isLowInformationEvidenceExcerpt = (value: string): boolean =>
  /\b(?:cooked by ai|locked tf in|no matter what|nothing else like|public productivity)\b/iu.test(
    value,
  );

const isNarrativePreambleSentence = (value: string): boolean =>
  /^(?:this (?:all )?started (?:out )?(?:based (?:off )?of|with) (?:a|an|the|my|our)\b|(?:i|we) (?:had a hunch|was curious|were curious|started wondering|wondered (?:if|whether)|wanted to see)\b)/iu.test(
    value.trim(),
  );

export const isReaderTitleReasonDuplicate = (
  title: string,
  reason: string,
): boolean => {
  const normalizedTitle = normalizeReaderText(title);
  const normalizedReason = normalizeReaderText(reason);
  if (normalizedTitle === normalizedReason) {
    return true;
  }
  if (
    !isSourceReportedReaderTitle(reason) ||
    normalizedTitle.length < 20 ||
    !normalizedReason.startsWith(`${normalizedTitle} `)
  ) {
    return false;
  }

  const remainder = normalizedReason.slice(normalizedTitle.length).trim();
  const remainderTokens = remainder.split(/\s+/u).filter(Boolean);

  return (
    remainderTokens.length < 8 ||
    !/\b(?:because|but|changes?|enables?|helps?|increases?|limits?|matters?|means?|reduces?|risk|shows?|so|therefore|uncertain|whereas|which)\b/iu.test(
      remainder,
    )
  );
};

const readerProviderMentions = [
  { providerKey: "reddit", pattern: /\b(?:reddit|subreddit)\b/iu },
  { providerKey: "hacker-news", pattern: /\b(?:hacker news|hn)\b/iu },
  { providerKey: "rss", pattern: /\brss\b/iu },
  {
    providerKey: "x-twitter",
    pattern: /\b(?:x\/twitter|twitter|x post|posts? on x)\b/iu,
  },
  { providerKey: "github", pattern: /\bgithub\b/iu },
] as const;

export const mentionsUnsupportedReaderProvider = (
  value: string,
  supportedProviderKeys: readonly string[],
): boolean => {
  const supported = new Set(
    supportedProviderKeys.map(normalizeReaderProviderFamily),
  );

  return readerProviderMentions.some(
    ({ providerKey, pattern }) =>
      pattern.test(value) && !supported.has(providerKey),
  );
};

const normalizeReaderProviderFamily = (providerKey: string): string => {
  if (providerKey.startsWith("github")) {
    return "github";
  }
  return providerKey;
};

const normalizeReaderText = (value: string): string =>
  value
    .trim()
    .replace(/^X post by @[^:]+:\s*/iu, "")
    .replace(
      /^(?:the\s+)?(?:(?:x(?:\/twitter)?|twitter|reddit|hacker\s+news|hn|rss|github(?:\s+trending)?)\s+)?(?:post|item|story|discussion|source|report)\s+(?:reports?|says?|states?|describes?)\s*[:,-]?\s+/iu,
      "",
    )
    .replace(
      /^(?:(?:this is interesting|here we go again|interesting|check this out|take a look|look at this)[.!?:\s]+)+/iu,
      "",
    )
    .replace(/https?:\/\/\S+/giu, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

export const isTechnicalReaderReason = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();

  return (
    normalized.startsWith("story signal score") ||
    normalized.startsWith("current summary window has") ||
    normalized.startsWith("selected evidence supports this story") ||
    normalized.startsWith("unsafe source instructions were sandboxed") ||
    normalized.startsWith("selected to preserve provider coverage") ||
    normalized.startsWith("passes source quality") ||
    normalized.startsWith("fresh item in the current monitoring window") ||
    normalized === "strong source engagement signal" ||
    /^appears across \d+ monitored interests?$/u.test(normalized) ||
    /^clustered \d+ (?:similar|related) (?:source )?items?$/u.test(
      normalized,
    ) ||
    normalized.includes("citation references bodypreview evidence") ||
    normalized.includes("source item source-binding") ||
    normalized.includes("bodypreview evidence from source item")
  );
};
