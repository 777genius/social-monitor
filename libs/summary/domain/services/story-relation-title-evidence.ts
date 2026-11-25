export type StoryRelationTitleEvidence = Readonly<{
  sharedTitleTokens: readonly string[];
  sharedEntityTokens: readonly string[];
  sharedEventTokens: readonly string[];
  sharedContextTokens: readonly string[];
}>;

/**
 * Provider-neutral title evidence. Eligibility is based only on normalized
 * title terms; callers may include body text as verifier context afterwards.
 */
export const strictStoryRelationTitleEvidence = (
  leftTitle: string,
  rightTitle: string,
): StoryRelationTitleEvidence | undefined => {
  const left = titleTerms(leftTitle);
  const right = titleTerms(rightTitle);
  const sharedTitleTokens = intersection(left.stems, right.stems);
  const sharedEntityTokens = sharedTitleTokens.filter(
    (term) => left.entityStems.has(term) || right.entityStems.has(term),
  );
  const sharedEventTokens = sharedTitleTokens.filter(
    (term) => left.eventStems.has(term) || right.eventStems.has(term),
  );
  const eventSet = new Set(sharedEventTokens);
  const sharedContextTokens = sharedTitleTokens.filter(
    (term) => !eventSet.has(term),
  );

  if (
    sharedEntityTokens.length === 0 ||
    sharedEventTokens.length === 0 ||
    sharedContextTokens.length < 1
  ) {
    return undefined;
  }
  return {
    sharedTitleTokens,
    sharedEntityTokens,
    sharedEventTokens,
    sharedContextTokens,
  };
};

const titleTerms = (title: string): Readonly<{
  stems: ReadonlySet<string>;
  entityStems: ReadonlySet<string>;
  eventStems: ReadonlySet<string>;
}> => {
  const rawTerms = title.normalize("NFKC")
    .replace(/[\p{Dash_Punctuation}]+/gu, " ")
    .match(/[\p{Letter}\p{Number}][\p{Letter}\p{Number}+#.]*/gu) ?? [];
  const stems = new Set<string>();
  const entityStems = new Set<string>();
  const eventStems = new Set<string>();
  rawTerms.forEach((raw, index) => {
    const lexical = raw.toLocaleLowerCase("en-US").replace(/^[.-]+|[.-]+$/gu, "");
    if (lexical.length < 3 || neutralStopTerms.has(lexical)) return;
    const stem = normalizedStem(lexical);
    if (stem.length < 3 || neutralStopTerms.has(stem)) return;
    stems.add(stem);
    if (looksLikeNamedEntity(raw, index)) entityStems.add(stem);
    if (looksLikeEventForm(lexical, stem)) eventStems.add(stem);
  });
  return { stems, entityStems, eventStems };
};

const normalizedStem = (term: string): string => {
  if (term.length > 6 && term.endsWith("ing")) return term.slice(0, -3).replace(/(.)\1$/u, "$1");
  if (term.length > 5 && term.endsWith("ied")) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith("ed")) return term.slice(0, -2).replace(/(.)\1$/u, "$1");
  if (term.length > 5 && term.endsWith("ies")) return `${term.slice(0, -3)}y`;
  if (term.length > 5 && term.endsWith("es")) return term.slice(0, -2);
  if (term.length > 4 && term.endsWith("s")) return term.slice(0, -1);
  return term;
};

const looksLikeNamedEntity = (raw: string, index: number): boolean =>
  /[\p{Letter}][\p{Number}]/u.test(raw) ||
  /[\p{Number}][\p{Letter}]/u.test(raw) ||
  /[\p{Lowercase_Letter}][\p{Uppercase_Letter}]/u.test(raw) ||
  (index > 0 && /^\p{Uppercase_Letter}/u.test(raw));

const looksLikeEventForm = (term: string, stem: string): boolean =>
  term !== stem && /(?:ed|ied|ing)$/u.test(term);

const intersection = (
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): readonly string[] => [...left].filter((term) => right.has(term)).sort();

const neutralStopTerms = new Set([
  "about", "after", "and", "are", "before", "for", "from", "has", "have",
  "how", "into", "new", "official", "that", "the", "their", "this", "with",
]);
