/**
 * Clause boundaries preserve object lists and decimal versions. A second
 * subject's assertion never borrows an earlier subject's exclusion.
 */
export const productSubject = String.raw`(?:[a-zA-Z][a-zA-Z-]*\s+){0,3}[a-zA-Z][a-zA-Z-]*[-\s]+\d+(?:\.\d+)+(?:[a-zA-Z])?`;
export const namedActor = String.raw`(?:[A-Z][A-Za-z-]*\s+){1,4}`;
export const completedVerb = String.raw`(?:[a-z-]+ed|ran|found|stole|took|made|broke|lost|cut|got|became|began|sent|built|sold|bought|gave|wrote|saw|had)`;
export const finitePredicate = String.raw`(?!(?:as|vs|its|this)\b)(?:${completedVerb}|[a-z-]+s|was|were|will|would|can|could|may|might|must)`;
// A version immediately after a word ending in "s" does not turn that product
// name into a verb. In particular, a bare branded version is not a first clause.
const finiteAssertion = String.raw`(?:[a-zA-Z][a-zA-Z-]*\s+){1,4}?${finitePredicate}\s+(?!\d+(?:\.\d+)+(?:\s|$)|(?:vs|versus|of|for|with|on|in|at|from|than)\b)\S`;
export const pluralSubjectPredicate = String.raw`(?!(?:this|its|as|vs)\b)[a-z-]+s\s+(?!(?:vs|versus|of|for|with|on|in|at|from|than)\b)[a-z-]+\s+\S`;
const subjectPredicate = new RegExp(`^(?:${productSubject}\\s+${finitePredicate}\\b|${finiteAssertion})`, "i");
const coordinatedAssertion = new RegExp(
  String.raw`,?\s+and\s+(?!(?:what|how|why)\b)(?=(?:${productSubject}\s+(?:is|was|has|remains)\b|${finiteAssertion}|${pluralSubjectPredicate}|(?:it|they|we|he|she)\s+|${completedVerb}\s+))`,
  "gi",
);
// Conjunction casing is independent of the capitalized-name heuristic. Making
// that heuristic case-insensitive would split ordinary descriptive noun lists.
const coordinatedNamedAssertion = new RegExp(
  String.raw`,?\s+[aA][nN][dD]\s+(?=${namedActor}[a-z]+\s+)`,
  "g",
);
// Punctuation can separate a complete assertion as well as an object list. Only
// split when the following text supplies a subject and predicate; dates and
// descriptive noun lists stay attached to their clause.
const punctuatedAssertion = new RegExp(
  String.raw`(?:[,:]|\s[—–])\s+(?=(?:${productSubject}\s+(?:is|was|has|remains)\b|${finiteAssertion}|${pluralSubjectPredicate}|${completedVerb}\s+))`,
  "gi",
);
const punctuatedNamedAssertion = new RegExp(String.raw`(?:[,:]|\s[—–])\s+(?=${namedActor}[a-z][a-z-]*\s+\S)`, "g");
// Temporal and causal clauses still assert their own events. Require a finite
// subject/predicate so a date or noun adjunct does not become another clause.
const subordinateAssertion = new RegExp(
  String.raw`\s+(?:after|before|because|since|when|once|though|as|where|that)\s+(?!(?:many|much|few|little)\b|(?:[a-z-]+ed|[a-z-]+ing)\s+(?:and|or|what|how|to)\b)(?=(?:${productSubject}\s+${finitePredicate}\b|${finiteAssertion}|${pluralSubjectPredicate}))`,
  "gi",
);
// Preserve the existing unknown-named-predicate guard at subordinate boundaries
// too. A quoted model result must not hide another named actor's assertion.
const subordinateNamedAssertion = new RegExp(
  String.raw`\s+(?:after|before|because|since|when|once|though|as|where|that)\s+(?=${namedActor}[a-z][a-z-]*\s+\S)`,
  "g",
);
export const releaseEventStatements = (text: string): string[] => text
  .split(/\n|(?<!\bvs)[.!?](?=\s|$)/i).map((part) => part.trim()).filter(Boolean);

const punctuatedClauses = (clause: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  for (const match of clause.matchAll(punctuatedAssertion)) {
    const next = match.index + match[0].length;
    const prefix = clause.slice(0, match.index);
    const depth = [...prefix].reduce((level, char) => level + (char === "(" ? 1 : char === ")" ? -1 : 0), 0);
    // Parenthetical noun lists often contain participial modifiers. An explicit
    // subject/predicate inside the parentheses still forms a separate assertion.
    if (depth > 0 && !subjectPredicate.test(clause.slice(next))) continue;
    parts.push(clause.slice(start, match.index)); start = next;
  }
  return [...parts, clause.slice(start)];
};

export const releaseEventClauses = (text: string): string[] => releaseEventStatements(text)
  .flatMap((part) => part.split(/\s*;\s*|,?\s+\b(?:while|whereas|but|although)\s+/i))
  .flatMap((part) => part.split(subordinateAssertion).flatMap((assertion) => assertion.split(subordinateNamedAssertion)))
  .flatMap((part) => part.split(coordinatedAssertion).flatMap((assertion) => assertion.split(coordinatedNamedAssertion)).flatMap((clause) => {
    const assertions = punctuatedClauses(clause).flatMap((assertion) => assertion.split(punctuatedNamedAssertion));
    // An introductory fragment does not establish the first subject. Keep it
    // attached so the caller can decline unsupported attribution/stage grammar.
    return subjectPredicate.test(assertions[0]!.trim()) ? assertions : [clause];
  }))
  .map((part) => part.trim()).filter(Boolean);
