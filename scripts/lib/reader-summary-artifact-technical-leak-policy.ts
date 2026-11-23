export function collectUserFacingTechnicalLeaks(content: {
  readonly headline: string;
  readonly oneLineTakeaway: string;
  readonly bullets: readonly string[];
  readonly topReads: readonly {
    readonly title: string;
    readonly reason: string;
    readonly whyNow: string;
    readonly whyImportant: readonly string[];
  }[];
  readonly selectedPosts: readonly {
    readonly title: string;
    readonly reason: string;
    readonly whyNow: string;
    readonly whyImportant: readonly string[];
  }[];
  readonly risks: readonly string[];
  readonly openQuestions: readonly string[];
  readonly nextActions: readonly {
    readonly label: string;
    readonly reason: string;
  }[];
}): readonly string[] {
  const values = [
    content.headline,
    content.oneLineTakeaway,
    ...content.bullets,
    ...content.risks,
    ...content.openQuestions,
    ...content.nextActions.flatMap((item) => [item.label, item.reason]),
    ...content.topReads.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
    ...content.selectedPosts.flatMap((item) => [
      item.title,
      item.reason,
      item.whyNow,
      ...item.whyImportant,
    ]),
  ];

  return values.filter((value) =>
    technicalLeakPatterns.some((pattern) => pattern.test(value)),
  );
}

export function countUiPayloadTechnicalTags(
  items: readonly { readonly matchedRules: readonly string[] }[],
): number {
  return items.reduce(
    (count, item) =>
      count +
      item.matchedRules.filter((rule) =>
        /^(interest|source-binding|sourcebinding|provider|rule|binding|scope):/i.test(
          rule,
        ),
      ).length,
    0,
  );
}

const technicalLeakPatterns = [
  /\bsource item\b/i,
  /\bcanonicalurl\b/i,
  /\bsource-binding\b/i,
  /\bsourcebinding\b/i,
  /\binterest:[0-9a-f-]{8,}\b/i,
  /\bprovider:[a-z0-9_-]+\b/i,
  /\bfeed_item\b/i,
  /\bsource_item\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
];
