import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { hasUnboundReleaseAction, releaseEventClauses, releaseEventStatements } from "./story-release-event-clauses";
import { releaseDescriptionScope, reportedReleaseContent } from "./story-release-event-description";

/** Evidence for a verification-only exception, never deterministic merge authority. */
export type StoryReleaseEventIdentity = {
  readonly publisher: string;
  readonly targets: readonly string[];
  readonly stage: "release" | "preview";
  readonly eventDate?: string;
};

const releaseAction = /\b(?:launch(?:es|ed|ing)?|introduc(?:es|ed|ing)|releas(?:es|ed|ing)|unveil(?:s|ed|ing)?)\b/i;
const separateSubject = /\b(?:watermark(?:ed|ing)?|detector|integration|tutorial|retrospective|rumou?rs?|teaser|speculat\w*|exploit|incident|breach|quota|limits|review|independent|experiment)\b/i;
const uncertainAction = /\b(?:will|would|could|might|may|plans? to|expected to|not yet|no confirmed)\b/i;
const independentWork = /\b(?:we|i|our (?:lab|team))\s+(?:(?:have|has|now|also|just)\s+)*(?:test(?:ed)?|measur(?:ed|e)|benchmark(?:ed)?|ran|publish(?:ed)?|found|discover(?:ed)?)\b|\bour own (?:benchmark|experiment|measurements?|review)\b/i;
const word = "[a-z][a-z-]*";
const versionedProduct = new RegExp(`^((?:${word}\\s+){0,3}${word})[-\\s]+(\\d+(?:\\.\\d+)+(?:[a-z])?)(?=$|[\\s,/:])`, "i");

/**
 * Deliberately bounded English release grammar. Unknown subject attachment gives
 * no exception. Targets come from the primary assertion, never a version bag.
 * Author handles and social-provider identity do not establish the publisher.
 */
export const storyReleaseEventIdentity = (
  item: SummaryEvidenceItem,
): StoryReleaseEventIdentity | undefined => {
  const source = item.sourceText ?? item.bodyPreview ?? "";
  // Do not infer identity from a partial long post whose later subject is unseen.
  if (source.length > 4_096) return undefined;
  const generatedTitle = /^X post by @[^:]+:/i.test(item.title);
  const title = clean(item.title.replace(/^X post by @[^:]+:\s*/i, ""));
  const body = clean(source);
  const lead = firstAssertion(body);
  const headline = firstAssertion(title);
  if (separateSubject.test(headline) || uncertainHeadline(headline) ||
      independentWork.test(body)) return undefined;

  const sourceAssertion = releaseAssertion(lead);
  const assertion = sourceAssertion ?? releaseAssertion(headline);
  if (assertion !== undefined) {
    if (separateSubject.test(assertion.subject) || uncertainAction.test(assertion.before)) {
      return undefined;
    }
    const targets = releaseTargets(assertion.subject);
    if (targets === undefined) return undefined;
    const publisher = namedPublisher(assertion.before) ??
      firstPersonPublisher(assertion.before, body, targets);
    if (publisher === undefined || unattributedMeasurements(body, publisher)) return undefined;
    if (sourceAssertion === undefined && !corroboratesHeadline(lead, body, targets, publisher)) {
      return undefined;
    }
    const titleAssertion = releaseAssertion(headline);
    // Headline/body disagreement is ambiguity, not extra matching evidence.
    if (titleAssertion !== undefined) {
      const titleTargets = releaseTargets(titleAssertion.subject);
      if ((!generatedTitle && titleTargets === undefined) ||
          (titleTargets !== undefined && !compatibleTargets(targets, titleTargets)) ||
          uncertainAction.test(titleAssertion.before)) return undefined;
      const titlePublisher = namedPublisher(titleAssertion.before) ??
        firstPersonPublisher(titleAssertion.before, body, targets);
      if (titlePublisher !== undefined && titlePublisher !== publisher) return undefined;
    } else {
      const titleProduct = versionedProduct.exec(headline);
      if (titleProduct === null || !compatibleTargets(targets,
        [targetKey(titleProduct[1]!, titleProduct[2]!)])) return undefined;
    }
    const context = releaseContext(headline, body, targets, publisher);
    if (context === undefined || uncertainHeadline(context)) return undefined;
    const eventDate = releaseDate(context, item.publishedAt);
    if (eventDate === null) return undefined;
    return {
      publisher, targets,
      stage: /\b(?:preview|beta|early access)\b/i.test(context) ? "preview" : "release",
      ...(eventDate === undefined ? {} : { eventDate }),
    };
  }

  // A summary can lead with attributed release results rather than a launch verb.
  // Require a versioned subject, attribution in that assertion and an explicit
  // release reference. This excludes an independent test that quotes a launch.
  const product = versionedProduct.exec(lead);
  if (product === null || !/^\s+is\b/i.test(lead.slice(product[0].length)) ||
      separateSubject.test(lead) || !/\brelease\b/i.test(body)) return undefined;
  const attribution = /\b(?:says|according to)\s+([a-z][a-z-]*)\b/i.exec(lead);
  if (attribution?.[1] === undefined || uncertainAction.test(lead)) return undefined;
  const targets = [targetKey(product[1]!, product[2]!)];
  const titleProduct = versionedProduct.exec(headline);
  if (titleProduct === null || !compatibleTargets(targets,
    [targetKey(titleProduct[1]!, titleProduct[2]!)])) return undefined;
  if (hasUnboundReleaseAction(lead, attribution[1].toLowerCase())) return undefined;
  const context = releaseContext(headline, body, targets, attribution[1].toLowerCase());
  if (context === undefined || uncertainHeadline(context) ||
      unattributedMeasurements(body, attribution[1].toLowerCase())) return undefined;
  const eventDate = releaseDate(context, item.publishedAt);
  if (eventDate === null) return undefined;
  return {
    publisher: attribution[1].toLowerCase(),
    targets, stage: /\b(?:preview|beta|early access)\b/i.test(context) ? "preview" : "release",
    ...(eventDate === undefined ? {} : { eventDate }),
  };
};

export const samePrimaryReleaseEvent = (
  left: SummaryEvidenceItem,
  right: SummaryEvidenceItem,
): boolean => {
  const a = storyReleaseEventIdentity(left);
  const b = storyReleaseEventIdentity(right);
  return a !== undefined && b !== undefined && a.publisher === b.publisher &&
    a.stage === b.stage && compatibleTargets(a.targets, b.targets) &&
    (a.eventDate === undefined || b.eventDate === undefined ||
      compatibleDates(a.eventDate, b.eventDate));
};

const clean = (text: string): string => text.replace(/[*_]/g, "").trim();
const firstAssertion = (text: string): string =>
  text.split(/\n|[.!?](?=\s|$)/, 1)[0]?.trim() ?? "";

const releaseAssertion = (text: string): { before: string; subject: string } | undefined => {
  const action = releaseAction.exec(text);
  if (action === null) return undefined;
  return { before: text.slice(0, action.index).trim(),
    subject: text.slice(action.index + action[0].length).trim() };
};

const namedPublisher = (before: string): string | undefined => {
  const normalized = before.replace(/^(?:just in|breaking|today):?\s*/i, "").trim();
  const match = /^([a-z][a-z-]*)(?:\s+has)?$/i.exec(normalized);
  return match?.[1] !== undefined && !/^(?:we|i|they|it)$/i.test(match[1])
    ? match[1].toLowerCase() : undefined;
};

const firstPersonPublisher = (
  before: string, body: string, targets: readonly string[],
): string | undefined => {
  if (!/^(?:we(?:'re| are)?|)$/i.test(before)) return undefined;
  // Textual attribution only, not a claim of authenticated publisher provenance.
  // The cited release page must name every target and version; arbitrary links
  // and author handles cannot supply an otherwise absent publisher.
  const hosts = [...body.matchAll(/https:\/\/(?:www\.)?([a-z][a-z-]*)\.[a-z]{2,}\/([a-z0-9/-]+)/gi)]
    .filter((match) => targets.every((target) => {
      const [name, version] = target.split("@");
      const path = `-${match[2]!.toLowerCase()}-`;
      return name !== undefined && version !== undefined &&
        path.includes(`-${name.split(" ").at(-1)}-`) &&
        path.includes(`-${version.replaceAll(".", "-")}-`);
    })).map((match) => match[1]!.toLowerCase());
  const unique = [...new Set(hosts)];
  return unique.length === 1 ? unique[0] : undefined;
};

const targetKey = (name: string, version: string): string =>
  `${name.toLowerCase().replace(/\s+/g, " ")}@${version.toLowerCase()}`;

const releaseTargets = (subject: string): readonly string[] | undefined => {
  // Only the grammatical release object. Everything after a qualifier is detail,
  // including old-version comparisons. Residual object nouns fail closed.
  const phrase = subject.split(/(?:,\s*)?\b(?:for|on|at|in|with|compared|versus|vs|its|the world's)\b/i, 1)[0]!.trim();
  const parts = phrase.split(/\s*,\s*(?:(?:and|&)\s+)?|\s+(?:and|&)\s+|\s*\/\s*/i);
  const targets: string[] = [];
  for (const part of parts) {
    const match = versionedProduct.exec(part);
    if (match === null || part.slice(match[0].length).trim() !== "") return undefined;
    targets.push(targetKey(match[1]!, match[2]!));
  }
  return targets.length > 0 ? targets : undefined;
};

const sameTarget = (left: string, right: string): boolean => {
  const [a, av] = left.split("@"); const [b, bv] = right.split("@");
  // Omitted brand prefix is allowed only with the same complete model/version.
  return av === bv && a !== undefined && b !== undefined &&
    (a === b || a.endsWith(` ${b}`) || b.endsWith(` ${a}`));
};

const compatibleTargets = (left: readonly string[], right: readonly string[]): boolean => {
  const subset = (a: readonly string[], b: readonly string[]): boolean =>
    a.every((target) => b.some((other) => sameTarget(target, other)));
  // Joint announcement vs one included model is allowed; two partly overlapping
  // joint launches are not. Versions are attached to targets before comparison.
  return subset(left, right) || subset(right, left);
};

const uncertainHeadline = (text: string): boolean =>
  uncertainAction.test(text.replace(/\bmay\s+\d/gi, "date"));

const sentences = (body: string): string[] =>
  releaseEventClauses(body);

const measurementAction = new RegExp([
  String.raw`\b(?:measured|measures|tested|benchmarked)\b`,
  // A quantified workload is an experimental object even without a benchmark
  // noun. Keep the actor before the verb available for positive attribution.
  String.raw`\b(?:ran|executed|completed|performed)\s+(?:\d[\d,]*|a|an|the)\s+(?:[a-z-]+\s+){0,3}(?:tasks?|trials?|problems?|cases?|workloads?)\b`,
  String.raw`\b\d[\d,]*\s+(?:[a-z-]+\s+){0,3}(?:tasks?|trials?|problems?|cases?|workloads?)\s+(?:was|were|have been|had been)\s+(?:[a-z-]+ly\s+){0,3}(?:run|executed|completed|performed)\b`,
  String.raw`\b(?:ran|conducted|performed|published)\s+(?:(?:a|an|the|new|fresh|its|their|own|coding|independent)\s+){0,4}(?:benchmarks?|measurements?|tests?|experiments?)\b`,
  // Sentence splitting already preserves decimal model versions.
  String.raw`\b(?:benchmarks?|measurements?|tests?|experiments?)\b(?:(?!\b(?:was|were|is|are|has|have|had)\b)[^;])*?\b(?:was|were|has been|have been)\s+(?:[a-z-]+ly\s+){0,3}(?:run|conducted|performed|published|made)\b`,
].join("|"), "gi");

// Detection is intentionally wider than attribution grammar. An unparsed
// experiment must not become "no measurement" and inherit a quoted launch.
const measurementSignal = /\b(?:measur\w*|evaluat(?:ed|ion|ions)|tested|benchmarked)\b|\b(?:benchmarks?|tests?|experiments?)\s+(?:of|by|from|on)\b|\b(?:a|an|new|fresh|independent|own)\s+(?:[a-z-]+\s+){0,3}(?:benchmarks?|tests?|experiments?)\b|\b(?:benchmarks?|tests?|experiments?)\b[^;]*?\b(?:was|were|is|are|has|have|had)\b/i;

const unattributedMeasurements = (body: string, publisher: string): boolean =>
  sentences(body).some((sentence) => {
    const actions = [...sentence.matchAll(measurementAction)];
    if (measurementSignal.test(sentence.replace(measurementAction, ""))) return true;
    if (actions.length === 0) return false;
    // Multiple experiment assertions need their own attribution; do not let a
    // publisher clause launder a second actor through the same sentence.
    if (actions.length !== 1) return true;
    const action = actions[0]!;
    // A release summary may quote performance scores and partner experience.
    // A new measurement is a separate event unless its actor is the publisher;
    // merely mentioning the publisher/launch elsewhere is not attribution.
    const actor = sentence.slice(0, action.index).trim().replace(/\s+has$/i, "");
    if (actor.toLowerCase() === publisher) return false;
    const passiveActor = /^\s+by\s+([a-z][a-z-]*)(?=$|[.,;]|\s+(?:using|on|for|with)\b)/i
      .exec(sentence.slice(action.index + action[0].length));
    return passiveActor?.[1]?.toLowerCase() !== publisher;
  });

const corroboratesHeadline = (
  lead: string, body: string, targets: readonly string[], publisher: string,
): boolean => {
  // A versioned source header is independent evidence of the complete release
  // object. Do not manufacture it from a title or from comparator mentions.
  const header = lead.replace(/\s*\([a-z]+\.?\s+\d{4}\)\s*$/i, "");
  const headerTargets = releaseTargets(header);
  if (headerTargets === undefined || headerTargets.length !== targets.length ||
      !headerTargets.every((target) => targets.some((other) => sameTarget(target, other)))) return false;
  const assertions = sentences(body).slice(1);
  if (assertions.some((sentence) => {
    const attribution = /\b(?:says|according to)\s+([a-z][a-z-]*)\b/i.exec(sentence);
    const release = releaseAssertion(sentence);
    const actor = release === undefined ? undefined : namedPublisher(release.before);
    return (attribution !== null && attribution[1]!.toLowerCase() !== publisher) ||
      (actor !== undefined && actor !== publisher);
  })) return false;
  return assertions.some((sentence) => {
    const product = versionedProduct.exec(sentence);
    return product !== null && targets.some((target) =>
      sameTarget(target, targetKey(product[1]!, product[2]!))) &&
      /^\s+is\s+(?:now\s+)?(?:available|GA)\b/i.test(sentence.slice(product[0].length));
  });
};

// Find explicit facts independently of auxiliaries/modifiers. Subject binding
// below decides whether they belong here; unsupported facts decline the exception.
const releaseState = /\b(?:released|launched|introduced|unveiled|available|availability|GA|beta|preview|early access)\b/i;
const unsupportedStage = /\b(?:alpha|experimental|stage|status|deprecated|withdrawn|retired|unavailable|unreleased|pre-?release|closed testing|limited access)\b/i;
const anaphoricSubject = /^(?:it|they|both|(?:this|the) model|these models|(?:this|the|its) release)\b/i;
const attachedReleaseState = /^\s*(?:,\s*[^,;]+,\s*)?(?:was|were|is|are|has been|have been|remains?)\s+(?:(?:still|already|now|[a-z-]+ly)\s+){0,3}(?:(?:in|a|an)\s+)*(?:released|launched|introduced|unveiled|available|GA|generally available|beta|preview|early access)\b/i;

const hasReleaseFact = (sentence: string): boolean =>
  releaseState.test(sentence) || unsupportedStage.test(sentence) || explicitDateSignal.test(sentence);

const unresolvedReleaseFact = (sentence: string): boolean => {
  // A stage modifying an explicitly named ancillary object is not model stage.
  // Keep this grammatical and local: a keyword elsewhere cannot hide a fact.
  const remainder = sentence.replace(/\b(?:a|an)\s+(?:[a-z-]+\s+){0,10}(?:api|tool|service|detector|watermark)\s+in\s+(?:private\s+)?(?:preview|beta)\b/gi, "");
  return /\b(?:available|availability|GA|alpha|beta|preview|early access|stage|status)\b/i.test(remainder) ||
    unsupportedStage.test(remainder) || explicitDateSignal.test(remainder);
};

const releaseContext = (
  headline: string, body: string, targets: readonly string[], publisher: string,
): string | undefined => {
  const relevant: string[] = [];
  let primarySubject = true;
  const assertions = releaseEventStatements(body).flatMap((statement) =>
    sentences(statement).map((sentence) => ({ sentence,
      scope: releaseDescriptionScope(statement),
    })));
  for (const [index, { sentence, scope }] of assertions.entries()) {
    const content = reportedReleaseContent(sentence);
    const assertion = releaseAssertion(sentence);
    const activePublisher = assertion === undefined ? undefined : namedPublisher(assertion.before);
    const product = activePublisher === undefined ? versionedProduct.exec(content) : null;
    if (product !== null) {
      // A benchmark label such as "Task-Bench 4.0: 70%" is not a new model
      // subject. Attribution predicates likewise cannot become brand prefixes.
      if (!/^\s*:/.test(content.slice(product[0].length))) {
        primarySubject = compatibleTargets(targets, [targetKey(product[1]!, product[2]!)]);
      }
      // In passive voice the released object precedes the verb. Inspect it
      // before the active-voice parser can mistake the date for an object.
      if (index > 0 && hasReleaseFact(content.slice(product[0].length))) {
        if (primarySubject) {
          const actor = /\bby\s+([a-z][a-z-]*)\b/i.exec(content.slice(product[0].length));
          if (unsupportedStage.test(sentence) ||
              (actor !== null && actor[1]!.toLowerCase() !== publisher) ||
              !attachedReleaseState.test(content.slice(product[0].length))) return undefined;
          relevant.push(sentence);
        } else if (mentionsPrimaryTarget(content.slice(product[0].length), targets)) {
          // A clause boundary we cannot bind must not erase another explicit
          // primary-target assertion merely because this clause started elsewhere.
          return undefined;
        }
        continue;
      }
    }
    const anaphor = anaphoricSubject.exec(sentence);
    if (anaphor !== null && hasReleaseFact(sentence)) {
      const detail = sentence.slice(anaphor[0].length);
      const datedEvent = /release$/i.test(anaphor[0]) && /^\s+(?:occurred|took place)\s+(?:on|in)\b/i.test(detail);
      if (!primarySubject || unsupportedStage.test(sentence) ||
          (!attachedReleaseState.test(detail) && !datedEvent)) return undefined;
      relevant.push(sentence);
      continue;
    }
    if (index === 0 || (!hasReleaseFact(sentence) && /\b(?:this|the|a|promising|new) release\b/i.test(sentence))) {
      if (index > 0 && hasUnboundReleaseAction(sentence, publisher, primarySubject)) return undefined;
      relevant.push(sentence);
      continue;
    }
    if (assertion !== undefined) {
      const mentioned = releaseTargets(assertion.subject);
      if (mentioned !== undefined) primarySubject = compatibleTargets(targets, mentioned);
      if (mentioned !== undefined && primarySubject) {
        // A repeated target does not transfer another actor's launch to the
        // primary publisher. Unsupported attribution remains ambiguous.
        const actor = namedPublisher(assertion.before) ??
          firstPersonPublisher(assertion.before, body, targets);
        if (actor !== publisher) return undefined;
        relevant.push(sentence);
      }
      if (mentioned !== undefined) {
        if (!primarySubject && mentionsPrimaryTarget(sentence, targets)) return undefined;
        continue;
      }
    }
    if (unresolvedReleaseFact(sentence)) return undefined;
    // No recognized release/measurement signal is not evidence that an explicit
    // actor's action belongs to the launch quoted in the lead.
    if ([...sentence.matchAll(measurementAction)].length === 0 &&
        hasUnboundReleaseAction(sentence, publisher, primarySubject, scope)) return undefined;
  }
  const context = [headline, ...relevant].join("\n");
  return unsupportedStage.test(context) ? undefined : context;
};

const mentionsPrimaryTarget = (text: string, targets: readonly string[]): boolean =>
  targets.some((target) => {
    const [name, version] = target.split("@");
    if (name === undefined || version === undefined) return false;
    const model = name.split(" ").at(-1)!;
    return new RegExp(`\\b${model}[-\\s]+${version.replaceAll(".", "\\.")}\\b`, "i").test(text);
  });

const months = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "jun(?:e)?", "jul(?:y)?",
  "aug(?:ust)?", "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];
const explicitDateSignal = new RegExp([
  String.raw`\b(?:${months.filter((month) => month !== "may").join("|")})\b|\bmay\s+\d`,
  String.raw`\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})\b`,
  String.raw`\b(?:on|in|since|during)\s+(?:\d{4}|${months.join("|")})\b`,
  String.raw`\b(?:date|dated|yesterday|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|(?:last|next|previous)\s+(?:day|week|month|year|spring|summer|autumn|fall|winter)|\w+\s+(?:days?|weeks?|months?|years?)\s+ago)\b`,
].join("|"), "i");
const compatibleDates = (left: string, right: string): boolean =>
  left.startsWith(right) || right.startsWith(left);
const releaseDate = (text: string, publishedAt: Date): string | null | undefined => {
  const dates: string[] = [];
  // A day-first date must not be partially read as a month/year wildcard.
  if (new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${months.join("|")})\\b`, "i").test(text)) return null;
  let unparsed = text;
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    dates.push(match[0]); unparsed = unparsed.replace(match[0], "");
  }
  const monthPattern = new RegExp(`\\b(${months.join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d+))?\\b`, "gi");
  const monthNumber = (value: string): string => String(
    months.findIndex((month) => new RegExp(`^${month}$`, "i").test(value)) + 1,
  ).padStart(2, "0");
  for (const match of text.matchAll(monthPattern)) {
    if ((match[3] !== undefined && match[3].length !== 4) ||
        /^\s*[-–—/]\s*\d/.test(text.slice(match.index + match[0].length))) return null;
    dates.push(`${match[3] ?? publishedAt.getUTCFullYear()}-${monthNumber(match[1]!)}-${match[2]!.padStart(2, "0")}`);
    unparsed = unparsed.replace(match[0], "");
  }
  const monthYear = new RegExp(`\\b(${months.join("|")})\\.?\\s+(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(monthYear)) {
    dates.push(`${match[2]}-${monthNumber(match[1]!)}`); unparsed = unparsed.replace(match[0], "");
  }
  if (explicitDateSignal.test(unparsed)) return null;
  if (/\btoday\b/i.test(text)) dates.push(publishedAt.toISOString().slice(0, 10));
  if (/\b(?:yesterday|last (?:week|month|year)|tomorrow)\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/i.test(text)) return null;
  const unique = [...new Set(dates)].sort((a, b) => b.length - a.length);
  if (unique.some((date) => {
    const full = date.length === 7 ? `${date}-01` : date;
    const parsed = new Date(`${full}T00:00:00Z`);
    return !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== full ||
      !compatibleDates(unique[0]!, date);
  })) return null;
  return unique[0];
};
