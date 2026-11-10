import type { ReaderSummaryNarrativeSection } from "../../domain";

export const readerSummaryNarrativeMarkdown = (
  sections: readonly ReaderSummaryNarrativeSection[],
): string => {
  const lines: string[] = [];
  const lead = sections.find((section) => section.kind === "lead");
  if (lead !== undefined) {
    lines.push(lead.text);
  }
  for (const section of sections.filter(
    (item) => item.kind === "main_signal" || item.kind === "why_it_matters",
  )) {
    lines.push(`- **${displayLabel(section)}:** ${section.text}`);
  }
  const secondary = sections.filter(
    (section) => section.kind === "secondary_signal",
  );
  if (secondary.length > 0) {
    lines.push(
      "**Other signals today**",
      ...secondary.map((section) => `- **${section.title}:** ${section.text}`),
    );
  }
  const watch = sections.find((section) => section.kind === "watch");
  if (watch !== undefined) {
    lines.push(`- **Watch:** ${watch.text}`);
  }

  return lines.join("\n\n");
};

const displayLabel = (section: ReaderSummaryNarrativeSection): string =>
  section.kind === "main_signal" ? "Main signal" : "Why it matters";
