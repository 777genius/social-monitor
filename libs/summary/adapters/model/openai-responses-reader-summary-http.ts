import type { ReaderSummaryModelFailure } from "../../ports";
import { asRecord } from "./openai-responses-reader-summary-json";

export const classifyOpenAiReaderSummaryHttpFailure = (
  status: number,
  body: unknown,
): ReaderSummaryModelFailure => {
  const message =
    extractOpenAiErrorMessage(body) ??
    `OpenAI reader summary request failed with HTTP ${status}`;
  if (status === 429) {
    return { kind: "provider_rate_limited", retryable: true, message };
  }
  if (status === 400 || status === 413) {
    return { kind: "context_too_large", retryable: false, message };
  }
  if (status === 401 || status === 403) {
    return { kind: "provider_unavailable", retryable: false, message };
  }
  if (status >= 500) {
    return { kind: "provider_unavailable", retryable: true, message };
  }

  return { kind: "provider_unavailable", retryable: false, message };
};

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

const extractOpenAiErrorMessage = (body: unknown): string | undefined => {
  const record = asRecord(body);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" ? error.message : undefined;
};
