// Keep the historical HTTP entrypoint while isolating status/error policy
// from response-body I/O. Existing consumers need no import changes.
export { classifyOpenAiReaderSummaryHttpFailure } from "./openai-responses-reader-summary-http-failure";

export const readOpenAiResponseBody = async (
  response: Response,
): Promise<unknown> => {
  const text = await response.text();
  if (text.trim().length === 0) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};
