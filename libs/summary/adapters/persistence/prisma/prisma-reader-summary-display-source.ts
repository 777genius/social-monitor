import type { ReaderSummaryContent } from "../../../domain/entities/reader-summary-artifact";
import type { TopRead } from "../../../domain/entities/top-read";
import { isDisplayRoundTripText } from "../../../domain/services/reader-post-display-headline";
import { validCapturedReaderSource } from "../../../domain/services/reader-post-display-identity";

/** PostgreSQL JSON cannot store NUL/unpaired UTF-16. Rejected captures use a
 * reversible JSON-string envelope instead of silently losing source evidence. */
export const encodeDisplaySourceContent = (content: ReaderSummaryContent | undefined): unknown =>
  content === undefined ? undefined : {
    ...content,
    topReads: content.topReads.map(encode),
    ...(content.selectedPosts === undefined ? {} : { selectedPosts: content.selectedPosts.map(encode) }),
    interestSections: content.interestSections.map((section) => ({
      ...section, items: section.items.map(encode),
    })),
  };

const encode = (card: TopRead): unknown => {
  const source = card.capturedSource;
  if (source === undefined || (isDisplayRoundTripText(source.title) &&
      (source.body === undefined || isDisplayRoundTripText(source.body)))) return card;
  if (card.displayHeadline?.status !== "unavailable") {
    throw new Error("Accepted display source cannot require persistence repair");
  }
  return { ...card, capturedSource: { encoding: "json_string", value: JSON.stringify(source) } };
};

export const decodeDisplaySource = <T extends TopRead>(card: T): T => {
  const source: unknown = card.capturedSource;
  if (source === undefined) return card;
  if (typeof source === "object" && source !== null && "encoding" in source) {
    const encoded = source as Record<string, unknown>;
    if (Object.keys(encoded).length !== 2 || encoded.encoding !== "json_string" ||
        typeof encoded.value !== "string" || card.displayHeadline?.status !== "unavailable") {
      throw new Error("Invalid rejected display source encoding");
    }
    const decoded: unknown = JSON.parse(encoded.value);
    if (!validCapturedReaderSource(decoded)) throw new Error("Invalid captured reader source");
    return { ...card, capturedSource: decoded };
  }
  if (!validCapturedReaderSource(source)) throw new Error("Invalid captured reader source");
  return card;
};
