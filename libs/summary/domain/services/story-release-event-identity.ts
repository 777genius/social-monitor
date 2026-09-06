import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

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

  const assertion = releaseAssertion(lead) ?? releaseAssertion(headline);
  if (assertion !== undefined) {
    if (separateSubject.test(assertion.subject) || uncertainAction.test(assertion.before)) {
      return undefined;
    }
    const targets = releaseTargets(assertion.subject);
    if (targets === undefined) return undefined;
    const publisher = namedPublisher(assertion.before) ??
      firstPersonPublisher(assertion.before, body, targets);
    if (publisher === undefined) return undefined;
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
    const context = releaseContext(headline, body, targets);
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
  const context = releaseContext(headline, body, targets);
  if (uncertainAction.test(context.replace(/\bmay\s+\d/gi, "date"))) return undefined;
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
  const phrase = subject.split(/,|\b(?:for|on|at|in|with|compared|versus|vs|its|the world's)\b/i, 1)[0]!.trim();
  const parts = phrase.split(/\s+(?:and|&)\s+|\s*\/\s*/i);
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

const releaseContext = (headline: string, body: string, targets: readonly string[]): string => {
  const assertions = body.split(/\n|[.!?](?=\s|$)/).map((part) => part.trim());
  const relevant = assertions.filter((sentence, index) => {
    if (index === 0 || /\b(?:this|the|a|promising|new) release\b/i.test(sentence)) return true;
    const assertion = releaseAssertion(sentence);
    if (assertion !== undefined) {
      const mentioned = releaseTargets(assertion.subject);
      return mentioned !== undefined && compatibleTargets(targets, mentioned);
    }
    const product = versionedProduct.exec(sentence);
    return product !== null && compatibleTargets(targets, [targetKey(product[1]!, product[2]!)]) &&
      /\bis (?:available|GA)\b/i.test(sentence);
  });
  return [headline, ...relevant].join("\n");
};

const months = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "jun(?:e)?", "jul(?:y)?",
  "aug(?:ust)?", "sep(?:t(?:ember)?)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];
const compatibleDates = (left: string, right: string): boolean =>
  left.startsWith(right) || right.startsWith(left);
const releaseDate = (text: string, publishedAt: Date): string | null | undefined => {
  const dates: string[] = [];
  for (const match of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) dates.push(match[0]);
  const monthPattern = new RegExp(`\\b(${months.join("|")})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "gi");
  const monthNumber = (value: string): string => String(
    months.findIndex((month) => new RegExp(`^${month}$`, "i").test(value)) + 1,
  ).padStart(2, "0");
  for (const match of text.matchAll(monthPattern)) {
    dates.push(`${match[3] ?? publishedAt.getUTCFullYear()}-${monthNumber(match[1]!)}-${match[2]!.padStart(2, "0")}`);
  }
  const monthYear = new RegExp(`\\b(${months.join("|")})\\.?\\s+(\\d{4})\\b`, "gi");
  for (const match of text.matchAll(monthYear)) dates.push(`${match[2]}-${monthNumber(match[1]!)}`);
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
