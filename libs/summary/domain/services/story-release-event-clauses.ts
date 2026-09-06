import { isReleaseDescription, type ReleaseDescriptionScope } from "./story-release-event-description";

import { completedVerb, finitePredicate, namedActor, pluralSubjectPredicate, productSubject,
  releaseEventClauses } from "./story-release-event-clause-boundaries";
export { releaseEventClauses, releaseEventStatements } from "./story-release-event-clause-boundaries";

const product = new RegExp(`^${productSubject}\\b`, "i");
const reference = /^(?:(?:this|the|its|new) (?:new )?(?:models?|release)|these models|it|they|both|this)\b/i;
const description = /^(?:is|are|has|have|remains?|improves?|scores?|uses?|costs?|excels?|offers?|includes?|describes?|reduces?|allows?|supports?|provides?|compares?|sets?|achieves?|unlocks?|flags?|can)\b/i;
const completedAction = new RegExp(`^${completedVerb}\\b`, "i");
const explicitActor = new RegExp(String.raw`^((?:[a-z][a-z-]*\s+){1,4}?)(${finitePredicate})(?=\s|$)`, "i");
const propertySubject = /^(?:(?:the|our|its|benign|watermark|cyber|biology|new|benchmark|partner)\s+)*(?:safeguards?|(?:security\s+)?requests?|false positives|fallbacks?|cost|pricing|cache reads|(?:benchmark\s+)?gains|partner quotes|announcement)\b/i;
const ownedSafeguards = /^(?:our|its|their)\s+(?:[a-z-]+\s+){0,3}safeguards\b/i;
const namedAssertion = new RegExp(`^${namedActor}[a-z][a-z-]*\\s+\\S`);
const pluralAssertion = new RegExp(`^${pluralSubjectPredicate}`, "i");

/**
 * Check explicit actor/predicate attachment, not a bag of incident keywords.
 * Unknown predicates of an explicit actor decline the release exception. Noun
 * phrases and metric fragments do not themselves assert a new event.
 */
export const hasUnboundReleaseAction = (
  clause: string, publisher: string, hasPrimarySubject = false, scope?: ReleaseDescriptionScope,
): boolean => {
  // A description is permission for one assertion, never for an unchecked
  // remainder. Also enforce this when callers supply a complete statement.
  const assertions = releaseEventClauses(clause);
  if (assertions.length > 1) {
    const first = assertions[0]!;
    const describedSubject = hasPrimarySubject || product.test(first) || reference.test(first);
    return assertions.some((assertion, index) => hasUnboundReleaseAction(
      assertion, publisher, index === 0 ? hasPrimarySubject : describedSubject, scope,
    ));
  }
  let text = clause.replace(/^[-*\s]+/, "").replace(/^and\s+/i, "");
  // A locative/measurement adjunct does not replace the actual subject. Never
  // strip an adjunct containing its own completed action.
  const adjunct = /^(?:on|in|at|across|for|with)\s+([^,]+),\s*/i.exec(text);
  if (adjunct !== null && !/\b(?:[a-z-]+ed|was|were|ran|found|stole|took|made)\b/i.test(adjunct[1]!)) {
    text = text.slice(adjunct[0].length);
  }
  if (isReleaseDescription(text, publisher, hasPrimarySubject, scope)) return false;
  const subject = reference.exec(text) ?? ownedSafeguards.exec(text) ?? propertySubject.exec(text) ?? product.exec(text);
  if (subject !== null) return unboundPredicate(text.slice(subject[0].length).trim());
  if (hasPrimarySubject && description.test(text)) return unboundPredicate(text);
  const property = /^(?:its|their)\s+(?:[a-z-]+\s+){1,4}?(?=(?:offers?|improves?|supports?|provides?)\b)/i.exec(text);
  if (property !== null) return unboundPredicate(text.slice(property[0].length));
  if (completedAction.test(text)) return true;
  const comparativeFragment = /^(?:[a-z-]+er|more|less|same|different|better)\s+/i.test(text);
  const actorText = text.replace(/^(?:the|a|an)\s+/i, "");
  const clauseIntroducer = /^(?:as|on|in|at|for|with|across|if|when|where|while|although|but|and|what|how|why|here|there)\b/i.test(actorText);
  const unknownSubject = !comparativeFragment && !clauseIntroducer &&
    (namedAssertion.test(actorText) || pluralAssertion.test(actorText));

  const actor = explicitActor.exec(text);
  if (actor !== null) {
    // An indefinite descriptive noun phrase can contain a capitalized plural
    // name. This must not exempt mixed-case predicates of an actual actor.
    if (/^[A-Z].*s$/.test(actor[2]!) && /^(?:a|an)\s+[a-z-]+\s+$/.test(actor[1]!)) return unknownSubject;
    const name = actor[1]!.trim().toLowerCase();
    const predicate = text.slice(actor[1]!.length);
    // A report of a publisher statement is attribution, not a new experiment.
    const report = /^(?:says|estimates)\s+/i.exec(predicate);
    if (name === publisher && report !== null) {
      return hasUnboundReleaseAction(predicate.slice(report[0].length), publisher);
    }
    // A plural noun before a comparison/preposition is a fragment, not a
    // finite action ("coding workloads vs its predecessor").
    const complement = predicate.slice(actor[2]!.length).trim();
    if (/s$/i.test(actor[2]!) && (complement === "" ||
        /^(?:vs|versus|for|of|with|on|in|at|from|than|to|instead of)\b/i.test(complement))) return unknownSubject;
    // A plural head followed by a present participle is a reduced relative
    // noun phrase, not an actor followed by a third-person singular verb.
    if (/s$/i.test(actor[2]!) && /^[a-z-]+ing\s+(?:up to\s+)?\d+(?:\.\d+)?x\s+(?:speedups|improvements)\b/i.test(complement)) return false;
    return true;
  }
  // Lower-case actors and passive incidents must also be checked. Restrict the
  // predicate position so an adjective in a noun phrase isn't an event verb.
  const finite = /^(?:[a-z][a-z-]*\s+){1,5}(?:was|were|has been|have been|had|ran|found|stole|took|made)\s+\S/i;
  if (finite.test(text)) return true;
  // Named actors and plural actors can take an unfamiliar base-form predicate.
  // Do not treat that unknown action as an absence of evidence. Comparative
  // noun phrases have no actor, e.g. "Lower cost for coding workloads".
  return unknownSubject;
};

const unboundPredicate = (raw: string): boolean => {
  const predicate = raw.replace(/^(?:(?:also|now|still|already|[a-z-]+ly)\s+){0,3}/i, "");
  // An access qualifier is a fragment; any subsequent finite assertion still
  // needs its own clause. Availability/date/stage are checked by the caller.
  if (/^(?:only\s+)?(?:via|through|for|with|on|in|vs|versus|compared to)\b/i.test(predicate) || /^[:,/]/.test(predicate) || predicate === "") return false;
  // A copula or possession verb does not prove a release property: "is under
  // attack" and irregular passives otherwise look like benign descriptions.
  // Recognize comparative properties and inclusion; other explicit states are
  // unsupported here (release date/stage are checked by the caller).
  if (/^(?:is|are|has|have|remains?)\b/i.test(predicate)) {
    return !/^(?:is|are|has|have|remains?)\s+(?:(?:now|still|[a-z-]+ly)\s+){0,3}(?:(?:more|less|fewer|same|different|better|lower|higher)\b|[a-z-]+er(?=\s+(?:on|at|for|than|with|vs|compared)\b|[,(:]|$))/i.test(predicate) &&
      !/^(?:is|are)\s+included\b/i.test(predicate);
  }
  return !description.test(predicate);
};
