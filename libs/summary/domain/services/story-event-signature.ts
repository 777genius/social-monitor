import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

export const STORY_EVENT_LEMMAS = [
  "acquire", "announce", "ban", "control", "deploy", "disclose", "fund",
  "invest", "launch", "merge", "outage", "partner", "patch", "raise",
  "recall", "release", "reveal", "rollout", "ship", "sue", "watermark",
] as const;

export type StoryEventLemma = typeof STORY_EVENT_LEMMAS[number];

export type StoryEventSignature = Readonly<{
  titleTokens: readonly string[];
  strongAnchors: readonly string[];
  eventPredicates: readonly StoryEventLemma[];
  qualifiers: readonly string[];
  eventRoles: readonly StoryEventRole[];
}>;

export type StoryEventRole = Readonly<{
  event: "acquisition" | "control" | "investment" | "merger" | "partnership";
  actorAnchor: string;
  objectAnchor: string;
  direction: "directed" | "symmetric";
}>;

export const storyEventSignature = (
  title: string,
): StoryEventSignature | undefined => {
  if (title.trim().length === 0) return undefined;
  const rawTokens = lexicalTokens(title);
  const titleTokens = uniqueSorted(rawTokens.map(({ normalized }) => normalized)
    .filter((token) => token.length >= 2 && !titleStopTokens.has(token)));
  const eventPredicates = uniqueSorted(rawTokens.flatMap(({ normalized }) => {
    const lemma = eventLemmaByForm.get(normalized);
    return lemma === undefined ? [] : [lemma];
  })) as readonly StoryEventLemma[];
  const strongAnchors = uniqueSorted(rawTokens.flatMap(({ raw, normalized }) =>
    isStrongAnchor(raw, normalized) ? [normalized] : []));
  const qualifiers = uniqueSorted(rawTokens.flatMap(({ normalized }) =>
    qualifierToken(normalized) ? [normalized] : []));
  return {
    titleTokens,
    strongAnchors,
    eventPredicates,
    qualifiers,
    eventRoles: eventRolesFromTokens(rawTokens),
  };
};

export const storyEventRolesConflict = (
  left: StoryEventSignature,
  right: StoryEventSignature,
): boolean => left.eventRoles.some((leftRole) =>
  right.eventRoles.some((rightRole) =>
    leftRole.event === rightRole.event &&
    leftRole.direction === "directed" && rightRole.direction === "directed" &&
    leftRole.actorAnchor === rightRole.objectAnchor &&
    leftRole.objectAnchor === rightRole.actorAnchor));

export const storyTitleSimilarity = (
  left: StoryEventSignature,
  right: StoryEventSignature,
): number => {
  const leftSet = new Set(left.titleTokens);
  const rightSet = new Set(right.titleTokens);
  const shared = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union === 0 ? 0 : shared / union;
};

export const sharedExactTokens = <T extends string>(
  left: readonly T[],
  right: readonly T[],
): readonly T[] => {
  const rightSet = new Set(right);
  return [...new Set(left.filter((token) => rightSet.has(token)))]
    .sort((leftToken, rightToken) => leftToken.localeCompare(rightToken));
};

export const speculativeQuestionClearedByBody = (
  item: SummaryEvidenceItem,
  signature: StoryEventSignature,
  actor: string,
  object: string,
  predicate: StoryEventLemma,
): boolean => {
  if (!isSpeculativeTitle(item.title)) return true;
  const body = [item.bodyPreview, item.sourceText]
    .filter((value): value is string => value !== undefined && value.trim() !== "")
    .join("\n");
  if (body.length === 0) return false;
  return body.split(/(?<=[.!])\s+|\n+/u).some((sentence) => {
    if (sentence.trim().length === 0 || isSpeculativeTitle(sentence) ||
        hasNegation(sentence)) return false;
    const bodySignature = storyEventSignature(sentence);
    if (bodySignature === undefined) return false;
    const tokens = new Set(bodySignature.titleTokens);
    return tokens.has(actor) && tokens.has(object) &&
      bodySignature.eventPredicates.includes(predicate) &&
      signature.qualifiers.every((qualifier) => tokens.has(qualifier));
  });
};

export const isSpeculativeTitle = (value: string): boolean => {
  const normalized = value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  return normalized.endsWith("?") ||
    /^(?:are|can|could|did|do|does|has|have|is|may|might|should|was|were|will|would)\b/u
      .test(normalized) ||
    /\b(?:allegedly|could|may|might|prediction|predicts?|reportedly|rumou?r|speculat(?:e|es|ed|ing|ion))\b/u
      .test(normalized);
};

export const hasNegation = (value: string): boolean =>
  /\b(?:cannot|didn['’]?t|doesn['’]?t|hasn['’]?t|isn['’]?t|never|no|not|won['’]?t|without)\b/iu
    .test(value);

type LexicalToken = Readonly<{
  raw: string;
  normalized: string;
}>;

const lexicalTokens = (value: string): readonly LexicalToken[] =>
  (value.normalize("NFKC")
  .match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}+#.]*/gu) ?? [])
  .map((raw) => ({ raw, normalized: normalizeToken(raw) }));

const normalizeToken = (raw: string): string => {
  const token = raw.toLocaleLowerCase("en-US").replace(/^[.-]+|[.-]+$/gu, "");
  return eventLemmaByForm.get(token) ?? sameLemmaMorphology(token);
};

const sameLemmaMorphology = (token: string): string => {
  if (token.length > 6 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 6 && token.endsWith("ing")) {
    return token.slice(0, -3).replace(/(.)\1$/u, "$1");
  }
  if (token.length > 5 && token.endsWith("ed")) {
    return token.slice(0, -2).replace(/(.)\1$/u, "$1");
  }
  if (token.length > 5 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
};

const eventLemmaByForm = new Map<string, StoryEventLemma>([
  ["acquire", "acquire"], ["acquired", "acquire"], ["acquires", "acquire"],
  ["acquiring", "acquire"], ["acquisition", "acquire"],
  ["announce", "announce"], ["announced", "announce"],
  ["announces", "announce"], ["announcement", "announce"],
  ["ban", "ban"], ["banned", "ban"], ["bans", "ban"], ["banning", "ban"],
  ["deploy", "deploy"], ["deployed", "deploy"], ["deploying", "deploy"],
  ["deployment", "deploy"], ["deploys", "deploy"],
  ["disclose", "disclose"], ["disclosed", "disclose"],
  ["discloses", "disclose"], ["disclosure", "disclose"],
  ["control", "control"], ["controlled", "control"],
  ["controlling", "control"], ["controls", "control"],
  ["fund", "fund"], ["funded", "fund"], ["funding", "fund"], ["funds", "fund"],
  ["invest", "invest"], ["invested", "invest"],
  ["investing", "invest"], ["investment", "invest"],
  ["investments", "invest"], ["invests", "invest"],
  ["launch", "launch"], ["launched", "launch"], ["launches", "launch"],
  ["launching", "launch"], ["merge", "merge"], ["merged", "merge"],
  ["merger", "merge"], ["merges", "merge"], ["merging", "merge"],
  ["outage", "outage"], ["outages", "outage"],
  ["unavailable", "outage"], ["unavailability", "outage"],
  ["partner", "partner"], ["partnered", "partner"],
  ["partnering", "partner"], ["partners", "partner"],
  ["partnership", "partner"], ["partnerships", "partner"],
  ["patch", "patch"], ["patched", "patch"], ["patches", "patch"],
  ["patching", "patch"], ["raise", "raise"], ["raised", "raise"],
  ["raises", "raise"], ["raising", "raise"], ["recall", "recall"],
  ["recalled", "recall"], ["recalls", "recall"], ["recalling", "recall"],
  ["release", "release"], ["released", "release"], ["releases", "release"],
  ["releasing", "release"], ["reveal", "reveal"], ["revealed", "reveal"],
  ["reveals", "reveal"], ["revealing", "reveal"],
  ["rollout", "rollout"], ["rollouts", "rollout"], ["rolledout", "rollout"],
  ["ship", "ship"], ["shipped", "ship"], ["shipping", "ship"], ["ships", "ship"],
  ["sue", "sue"], ["sued", "sue"], ["sues", "sue"], ["suing", "sue"],
  ["watermark", "watermark"], ["watermarked", "watermark"],
  ["watermarking", "watermark"], ["watermarks", "watermark"],
]);

const isStrongAnchor = (raw: string, token: string): boolean =>
  token.length >= 3 && !strongAnchorExclusions.has(token) &&
  !/^\d+(?:\.\d+)?[kmbt]$/iu.test(raw) &&
  !eventLemmaByForm.has(raw.toLocaleLowerCase("en-US")) &&
  (/\p{Lowercase_Letter}\p{Uppercase_Letter}/u.test(raw) ||
    /[\p{Letter}][\p{Number}]|[\p{Number}][\p{Letter}]/u.test(raw) ||
    /^\p{Uppercase_Letter}/u.test(raw) ||
    knownStrongAnchors.has(token));

const qualifierToken = (token: string): boolean =>
  /^(?:v?\d+(?:\.\d+)*|20\d{2})$/u.test(token) ||
  qualifierWords.has(token);

const knownStrongAnchors = new Set([
  "anthropic", "claude", "codex", "cursor", "github", "google", "meta",
  "microsoft", "openai", "reddit", "spacex", "xai",
]);
const strongAnchorExclusions = new Set([
  "ai", "company", "companies", "technology", "technologies", "news",
  "update", "updates", "user", "users", "official", "report",
]);
const titleStopTokens = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on",
  "or", "the", "to", "with",
]);
const qualifierWords = new Set([
  "confirmed", "global", "production", "preview", "beta", "january", "february",
  "march", "april", "may", "june", "july", "august", "september", "october",
  "november", "december",
]);

const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort((left, right) => left.localeCompare(right));

const eventRolesFromTokens = (
  tokens: readonly LexicalToken[],
): readonly StoryEventRole[] => {
  const roles: StoryEventRole[] = [];
  tokens.forEach((token, eventIndex) => {
    const event = roleEventByLemma.get(token.normalized);
    if (event === undefined) return;
    const rawForm = token.raw.toLocaleLowerCase("en-US");
    const nominal = nominalEventForms.has(rawForm);
    const passive = !nominal && pastParticipleEventForms.has(rawForm) &&
      passiveAuxiliaryBefore(tokens, eventIndex);
    const roleAnchors = passive
      ? passiveRoleAnchors(tokens, eventIndex)
      : nominal
        ? nominalRoleAnchors(tokens, eventIndex, event)
        : activeRoleAnchors(tokens, eventIndex, event);
    const { actorAnchor, objectAnchor } = roleAnchors;
    if (actorAnchor === undefined || objectAnchor === undefined ||
        actorAnchor === objectAnchor) return;
    const relationMarker = relationMarkerIndices(tokens, eventIndex, event)
      .map((index) => tokens[index]?.normalized)
      .find((marker) => marker === "with");
    const direction = (event === "merger" || event === "partnership") &&
        relationMarker === "with"
      ? "symmetric" as const : "directed" as const;
    const sortedAnchors = [actorAnchor, objectAnchor].sort();
    roles.push(direction === "symmetric"
      ? { event, actorAnchor: sortedAnchors[0]!,
          objectAnchor: sortedAnchors[1]!, direction }
      : { event, actorAnchor, objectAnchor, direction });
  });
  return roles.filter((role, index) => roles.findIndex((candidate) =>
    candidate.event === role.event && candidate.actorAnchor === role.actorAnchor &&
    candidate.objectAnchor === role.objectAnchor &&
    candidate.direction === role.direction) === index);
};

const roleEventByLemma = new Map<string, StoryEventRole["event"]>([
  ["acquire", "acquisition"], ["control", "control"],
  ["fund", "investment"], ["invest", "investment"],
  ["merge", "merger"], ["partner", "partnership"],
]);
const nominalEventForms = new Set([
  "acquisition", "control", "funding", "investment", "investments",
  "merger", "partnership", "partnerships",
]);
const roleRelationMarkers = new Map<StoryEventRole["event"], readonly string[]>([
  ["acquisition", ["of"]], ["control", ["of"]],
  ["investment", ["in", "into", "of"]], ["merger", ["with", "of"]],
  ["partnership", ["with", "of"]],
]);

const relationMarkerIndex = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  event: StoryEventRole["event"],
): number | undefined => {
  const markers = roleRelationMarkers.get(event) ?? [];
  const index = tokens.findIndex((token, candidateIndex) =>
    candidateIndex > eventIndex && candidateIndex <= eventIndex + 4 &&
    markers.includes(token.normalized));
  return index < 0 ? undefined : index;
};

const relationMarkerIndices = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  event: StoryEventRole["event"],
): readonly number[] => {
  const markers = roleRelationMarkers.get(event) ?? [];
  return tokens.flatMap((token, candidateIndex) =>
    candidateIndex > eventIndex && candidateIndex <= eventIndex + 8 &&
      markers.includes(token.normalized) ? [candidateIndex] : []);
};

const nextTokenIndex = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  expected: string,
): number | undefined => {
  const index = tokens.findIndex((token, candidateIndex) =>
    candidateIndex > eventIndex && candidateIndex <= eventIndex + 6 &&
    token.normalized === expected);
  return index < 0 ? undefined : index;
};

const markerIndexAfter = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  marker: string,
): number | undefined => nextTokenIndex(tokens, eventIndex, marker);

const passiveAuxiliaryBefore = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
): boolean => {
  const preceding = tokens[eventIndex - 1];
  return preceding !== undefined && passiveAuxiliaries.has(preceding.normalized);
};

const passiveAuxiliaries = new Set([
  "am", "are", "be", "been", "being", "get", "gets", "got", "gotten",
  "is", "was", "were",
]);

const pastParticipleEventForms = new Set([
  "acquired", "controlled", "funded", "invested", "merged", "partnered",
]);

const passiveRoleAnchors = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
): Readonly<{ actorAnchor?: string; objectAnchor?: string }> => {
  const byIndex = markerIndexAfter(tokens, eventIndex, "by");
  if (byIndex === undefined) return {};
  return {
    actorAnchor: strongAnchorAfter(tokens, byIndex),
    objectAnchor: strongAnchorBefore(tokens, eventIndex - 1),
  };
};

const activeRoleAnchors = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  event: StoryEventRole["event"],
): Readonly<{ actorAnchor?: string; objectAnchor?: string }> => {
  const byIndex = markerIndexAfter(tokens, eventIndex, "by");
  const relationIndex = relationMarkerIndex(tokens, eventIndex, event);
  const objectStart = relationIndex ?? eventIndex;
  return {
    actorAnchor: strongAnchorBefore(tokens, eventIndex),
    objectAnchor: strongAnchorAfter(tokens, objectStart, byIndex),
  };
};

const nominalRoleAnchors = (
  tokens: readonly LexicalToken[],
  eventIndex: number,
  event: StoryEventRole["event"],
): Readonly<{ actorAnchor?: string; objectAnchor?: string }> => {
  const actorBefore = strongAnchorBefore(tokens, eventIndex);
  const byIndex = markerIndexAfter(tokens, eventIndex, "by");
  const markers = relationMarkerIndices(tokens, eventIndex, event);
  if (actorBefore !== undefined) {
    return {
      actorAnchor: actorBefore,
      objectAnchor: firstAnchorAfterMarkers(tokens, markers, byIndex),
    };
  }
  if (byIndex === undefined) return {};
  const afterAgentMarkers = markers.filter((index) => index > byIndex);
  const beforeAgentMarkers = markers.filter((index) => index < byIndex);
  return {
    actorAnchor: strongAnchorAfter(tokens, byIndex,
      afterAgentMarkers[0] ?? tokens.length),
    objectAnchor: firstAnchorAfterMarkers(tokens,
      afterAgentMarkers.length > 0 ? afterAgentMarkers : beforeAgentMarkers,
      afterAgentMarkers.length > 0 ? undefined : byIndex),
  };
};

const firstAnchorAfterMarkers = (
  tokens: readonly LexicalToken[],
  markers: readonly number[],
  finalBoundary?: number,
): string | undefined => {
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    if (marker === undefined) continue;
    const boundary = markers[index + 1] ?? finalBoundary ?? tokens.length;
    const anchor = strongAnchorAfter(tokens, marker, boundary);
    if (anchor !== undefined) return anchor;
  }
  return undefined;
};

const strongAnchorBefore = (
  tokens: readonly LexicalToken[],
  index: number,
): string | undefined => [...tokens.slice(0, index)].reverse().find((token) =>
  isStrongAnchor(token.raw, token.normalized))?.normalized;

const strongAnchorAfter = (
  tokens: readonly LexicalToken[],
  index: number,
  beforeIndex = tokens.length,
): string | undefined => tokens.slice(index + 1, beforeIndex).find((token) =>
  isStrongAnchor(token.raw, token.normalized))?.normalized;
