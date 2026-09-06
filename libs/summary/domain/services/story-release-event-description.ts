/**
 * Positive attachment grammar for release descriptions. These clauses describe
 * a model, a release property, or an attributed use of the model. They do not
 * establish identity themselves; explicit release facts and experiments are
 * checked independently by the identity service.
 */
const modifiers = String.raw`(?:(?:[a-z-]+ly|also|now|still|already)\s+)*`;
const comparative = new RegExp(String.raw`^(?:${modifiers}(?:far\s+|substantially\s+)?(?:more|less|fewer|better|lower|higher|equal|same|different)\b|[\d~\\.% -]+(?:[a-z-]+er|more|less|fewer)\b|[a-z-]+er(?=\s+(?:on|at|for|than|with|vs|compared)\b|[,(:]|$)|(?:its|the)\s+most\s+)`, "i");
const metricHead = String.raw`(?:costs?|pricing|cache reads|accuracy|verbosity|(?:[a-z-]+\s+){0,3}(?:results|gains|improvements?|scores?|benchmarks?|safeguards|false positives|fallbacks|requests|questions)|vulnerability discovery|exploit generation|penetration testing|binary scanning)`;
const metricSubject = new RegExp(String.raw`^(?:(?:the|our|its|new|input/output)\s+)?${metricHead}\b`, "i");
const report = /^([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,3})\s+(says|reports|estimates|found)\s+/i;
const modelReference = /^(?:it|they|both|(?:this|the) model|these models)\b/i;
const versionedSubject = /^(?:[a-z][a-z-]*\s+){0,3}[a-z][a-z-]*[-\s]+\d+(?:\.\d+)+[a-z]?\b/i;
const quantifiedWorkload = String.raw`\d[\d,]*\s+(?:[a-z-]+\s+){0,3}(?:tasks?|trials?|problems?|cases?|workloads?)\b`;
const hasQuantifiedWorkload = new RegExp(quantifiedWorkload, "i");
const duration = String.raw`for\s+\d+(?:\.\d+)?\s+(?:hours?|minutes?)`;
const modelRun = /^((?:[a-z][a-z-]*\s+){1,4})ran\s+(?:it|the model)\s+(?:[a-z-]+\s+){0,2}?(?=for\b|on\b)/i;
const trialWorkload = new RegExp(String.raw`^(?:${duration}\s+on\s+${quantifiedWorkload}|on\s+${quantifiedWorkload}(?:\s+${duration})?)$`, "i");

export type ReleaseDescriptionScope = {
  readonly modelExecution: boolean;
  readonly propertyContext: boolean;
  readonly comparativePropertyChange?: boolean;
};

export const releaseDescriptionScope = (statement: string): ReleaseDescriptionScope => ({
  modelExecution: isModelUseAnecdote(statement) || isAttributedModelExperience(statement),
  propertyContext: metricSubject.test(statement),
  comparativePropertyChange: metricSubject.test(statement) &&
    /\b(?:loosened|reduced|improved)\s+where\b[^:]+:\s*\d+%\s+(?:fewer|less)\b/i.test(statement),
});

/** Running the model is distinct from running a quantified test workload. */
export const isModelUseAnecdote = (text: string): boolean =>
  /^(?:[a-z][a-z-]*\s+){1,4}ran\s+(?:it|the model)\s+(?:[a-z-]+\s+){0,2}for\s+\d+\s+(?:hours?|minutes?)\s+on\b/i.test(text) &&
  !hasQuantifiedWorkload.test(text);

export const isAttributedModelExperience = (text: string): boolean =>
  /^(?:[a-z][a-z-]*\s+){1,4}(?:says|reports)\s+(?:it|the model)\b/i.test(text);

export const reportedReleaseContent = (text: string): string => {
  const attribution = report.exec(text);
  return attribution !== null && attribution[2]!.toLowerCase() !== "found"
    ? text.slice(attribution[0].length) : text;
};

/** Comparative output observations are not an independently performed trial. */
const outputObservation = (text: string): boolean => {
  const ownedOutput = /^(?:its|their)\s+(?:[a-z-]+\s+){0,2}(?:updates|output|responses|answers)\s+/i.exec(text);
  return ownedOutput !== null && comparative.test(text.slice(ownedOutput[0].length));
};

const descriptivePredicate = (raw: string): boolean => {
  const text = raw.replace(new RegExp(`^${modifiers}`, "i"), "");
  if (comparative.test(text)) return true;
  const copula = /^(?:is|are|has|have|remains?|seems?)\s+/i.exec(text);
  if (copula !== null) {
    const complement = text.slice(copula[0].length).replace(new RegExp(`^${modifiers}`, "i"), "");
    return comparative.test(complement) || /^(?:down|up)\s+(?:around\s+)?\d/i.test(complement);
  }
  return false;
};

/** Model work is attached by its grammatical object, never by a nearby name. */
const modelWork = (text: string): boolean =>
  /^(?:diagnosed|solved|corrected)\s+(?:a|an|the|more)\s+(?:[a-z-]+\s+){0,3}(?:problems?|issues?|crash)\b/i.test(text) ||
  /^(?:designed|optimized)\s+[^.;]+\b(?:\d+(?:\.\d+)?(?:x|%)|faster|higher|lower)\b/i.test(text) ||
  /^(?:achieved|used)\s+(?:a\s+)?(?:nearly\s+)?(?:\d+(?:\.\d+)?%|half as many|fewer|less|more)(?=\s|$)/i.test(text);

export const isReleaseDescription = (
  raw: string, publisher: string, hasPrimarySubject: boolean,
  scope: ReleaseDescriptionScope = { modelExecution: false, propertyContext: false },
): boolean => {
  const { modelExecution, propertyContext } = scope;
  const text = raw.replace(/^[-*\s]+/, "").replace(/^and\s+/i, "");
  // The model can be the instrument of a quantified trial. Bind the whole
  // workload and its actor before considering benign usage/output exceptions.
  const run = modelRun.exec(text);
  if (run !== null && hasQuantifiedWorkload.test(text.slice(run[0].length))) {
    return run[1]!.trim().toLowerCase() === publisher &&
      trialWorkload.test(text.slice(run[0].length));
  }
  // These complements describe motivation, not completed actions. Keep the
  // complement restriction even when the reporting subject is the publisher.
  if (/^(?:although\s+)?it\s+(?:[a-z-]+ly\s+)?(?:shows|suggests|indicates)\s+they\s+(?:care|prefer|prioritize)\b/i.test(text)) return true;
  if (propertyContext && /^(?:it|they)\s+(?:is|are|was|were)\s+(?!(?:[a-z-]+ed|[a-z-]+en)\b)[a-z-]+(?=[:.]|$)/i.test(text)) return true;
  // An embedded report must describe the model or its output. A report of an
  // intrusion, test, or unrelated actor is still an unbound event.
  const attributed = report.exec(text);
  if (attributed !== null) {
    const content = text.slice(attributed[0].length);
    if (outputObservation(content)) return true;
    if (attributed[2]!.toLowerCase() === "found") return false;
    if (/^(?:equal|lower|higher)\s+accuracy\b/i.test(content)) return true;
    return isReleaseDescription(content, publisher, hasPrimarySubject, scope);
  }
  if (modelExecution && isModelUseAnecdote(text)) return true;
  const subject = modelReference.exec(text.replace(/^where\s+/i, "")) ?? versionedSubject.exec(text);
  if (subject !== null && hasPrimarySubject) {
    const predicate = text.replace(/^where\s+/i, "").slice(subject[0].length).trim().replace(new RegExp(`^${modifiers}`, "i"), "");
    return descriptivePredicate(predicate) || modelWork(predicate) ||
      /^will\s+cost\s+(?:around\s+)?\d+%\s+less\b/i.test(predicate);
  }
  if (modelExecution && /^(?:launched\s+(?:\d+|[a-z-]+)\s+experiments?\b|returned\s+with\s+results\b)/i.test(text)) return true;
  if (modelExecution && /^achieved\s+"[^"\n]+"\s+in\s+(?:internal\s+)?testing$/i.test(text)) return true;
  // A past-perfect failed attempt inside a quoted task outcome is background
  // to the solved problem. Completed actions and fresh experiments still fail.
  if (modelExecution && /^(?:other\s+)?(?:[a-z-]+\s+){0,2}(?:models|engineers)\s+had\s+failed\s+to\s+(?:explain|solve|diagnose)\b/i.test(text)) return true;
  const metric = metricSubject.exec(text);
  if (metric !== null) {
    const predicate = text.slice(metric[0].length).trim().replace(new RegExp(`^${modifiers}`, "i"), "");
    if (scope.comparativePropertyChange && /^(?:loosened|reduced|improved)$/i.test(predicate)) return true;
    if (descriptivePredicate(predicate)) return true;
    // Numeric fragments and current policy properties have no completed actor
    // action. Passives about theft/compromise do not fit either grammar.
    return /^(?:[:(]|(?:down|up)\s+\d|(?:fall|falls|trigger)\s+\d)/i.test(predicate) ||
      /^(?:is\s+)?(?:now\s+)?(?:allowed|restricted)\b/i.test(predicate) ||
      /^remain\s+(?:restricted|redirected)\b/i.test(predicate) ||
      /^(?:also\s+)?seems\s+improved\b/i.test(predicate) ||
      /^(?:is|are)\s+(?:also\s+)?(?:(?:coming\s+)?(?:down|up)|the\s+[a-z-]+\s*:|(?!(?:[a-z-]+ed|[a-z-]+en)\b)[a-z-]+$)/i.test(predicate) ||
      /^may\s+be\s+/i.test(predicate) ||
      /^(?:loosened|reduced|improved)\s+where\b[^:]+:\s*\d+%\s+(?:fewer|less)\b/i.test(predicate);
  }
  // Comparative conjuncts omit the model subject; noun lists and interrogative
  // fragments cannot supply an independent actor merely by ending in s/ed.
  if (hasPrimarySubject && descriptivePredicate(text)) return true;
  if (/^[a-z-]+ed\s+(?:[a-z-]+\s+){0,3}cost\s+savings\s+of\s+\d/i.test(text)) return true;
  if (/^[a-z-]+ing\s+(?:[a-z-]+\s+){0,4}cost\s+\d+(?:-\d+)?%/i.test(text)) return true;
  if (hasPrimarySubject && /^defaults?\s+to\b/i.test(text)) return true;
  // Current integration describes the model's use, not a separately launched
  // integration. Completed rollout actions still go through the action guard.
  if (/^(?:[a-z][a-z-]*\s+){1,4}(?:now\s+)?runs\s+on\s+/i.test(text) &&
      versionedSubject.test(text.replace(/^.*?\bruns\s+on\s+/i, ""))) return true;
  if (/^(?:partner\s+)?quotes\s+\([^)]*\)\s+(?:stress|describe|emphasize)\s+/i.test(text)) return true;
  if (/^there\s+is\s+no\s+(?:[a-z-]+\s+){0,3}(?:score|measurement)$/i.test(text)) return true;
  const ownerChange = /^(?:[a-z][a-z-]*\s+){1,4}(?:made|makes)\s+(?:its|our)\s+safeguards\s+/i.exec(text);
  if (ownerChange !== null && text.toLowerCase().startsWith(`${publisher} `) &&
      comparative.test(text.slice(ownerChange[0].length))) return true;
  return false;
};
