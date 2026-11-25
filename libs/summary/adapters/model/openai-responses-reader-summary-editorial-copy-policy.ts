import { optionalString } from "./openai-responses-reader-summary-json";

/** Provider text admission shared by legacy story sections and daily synthesis. */
export const readDailyEditorialNarrativeCopy = (
  item: Record<string, unknown>,
): { readonly title: string; readonly text: string } => {
  const title = optionalString(item.title);
  const text = optionalString(item.text);
  if (title === undefined || text === undefined) {
    throw new Error("Daily editorial narrative text is missing");
  }
  if (Array.from(text).length > 1_600 || !/[.!?…。！？]["'’”)]*$/u.test(text)) {
    throw new Error("Daily editorial narrative text is unfinished or too long");
  }
  return { title, text };
};
