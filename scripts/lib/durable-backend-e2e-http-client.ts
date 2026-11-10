import type { JsonRecord } from "./durable-backend-e2e-json-fields";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH";

/** One bounded HTTP capture client; no I/O until its methods are invoked. */
export function createDurableBackendHttpClient(
  config: { readonly apiBaseUrl: string },
  deps: {
    readonly isRecord: (value: unknown) => value is JsonRecord;
    readonly delay: (ms: number) => Promise<void>;
  },
) {
  const { isRecord, delay } = deps;

  async function pollJson<T extends JsonRecord>(
    path: string,
    headers: Readonly<Record<string, string>>,
    done: (value: JsonRecord) => T | undefined,
    options: { readonly timeoutMs: number; readonly label: string },
  ): Promise<T> {
    const deadline = Date.now() + options.timeoutMs;
    let lastValue: JsonRecord | undefined;
    while (Date.now() < deadline) {
      let value: JsonRecord;
      try {
        value = await requestJson<JsonRecord>("GET", path, { headers });
      } catch (error) {
        if (error instanceof RateLimitError) {
          const waitMs = Math.min(
            Math.max(error.retryAfterSeconds, 1) * 1_000,
            Math.max(deadline - Date.now(), 0),
          );
          lastValue = {
            rateLimited: true,
            retryAfterSeconds: error.retryAfterSeconds,
          };
          if (waitMs > 0) {
            await delay(waitMs);
            continue;
          }
        }
        throw error;
      }
      lastValue = value;
      const result = done(value);
      if (result !== undefined) {
        return result;
      }
      await delay(1_000);
    }

    throw new Error(
      `${options.label} did not complete before timeout; last=${JSON.stringify(lastValue ?? {})}`,
    );
  }

  async function requestStatus(
    path: string,
    headers: Readonly<Record<string, string>>,
  ): Promise<number> {
    let response: Response;
    try {
      response = await fetch(new URL(path, config.apiBaseUrl), {
        method: "GET",
        headers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`GET ${path} request failed: ${message}`);
    }

    await response.arrayBuffer().catch(() => undefined);
    return response.status;
  }

  async function requestJsonWithContext<T extends JsonRecord>(
    context: string,
    method: HttpMethod,
    path: string,
    options: {
      readonly headers: Readonly<Record<string, string>>;
      readonly body?: JsonRecord;
    },
  ): Promise<T> {
    try {
      return await requestJson<T>(method, path, options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${context}: ${message}`);
    }
  }

  async function requestJson<T extends JsonRecord>(
    method: HttpMethod,
    path: string,
    options: {
      readonly headers: Readonly<Record<string, string>>;
      readonly body?: JsonRecord;
    },
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...options.headers,
    };
    let response: Response;
    try {
      response = await fetch(new URL(path, config.apiBaseUrl), {
        method,
        headers:
          options.body === undefined
            ? headers
            : { ...headers, "content-type": "application/json" },
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${method} ${path} request failed: ${message}`);
    }
    const text = await response.text();
    const body = parseJsonResponse(text);

    if (response.status < 200 || response.status >= 300) {
      if (response.status === 429) {
        throw new RateLimitError(
          method,
          path,
          readRetryAfterSeconds(response, body),
          safeHttpErrorBody(body),
        );
      }
      throw new Error(
        `${method} ${path} failed with HTTP ${response.status}: ${safeHttpErrorBody(body)}`,
      );
    }
    if (!isRecord(body)) {
      throw new Error(`${method} ${path} did not return a JSON object`);
    }

    return body as T;
  }

  class RateLimitError extends Error {
    constructor(
      readonly method: HttpMethod,
      readonly path: string,
      readonly retryAfterSeconds: number,
      readonly safeBody: string,
    ) {
      super(
        `${method} ${path} failed with HTTP 429; retryAfterSeconds=${retryAfterSeconds}; body=${safeBody}`,
      );
    }
  }

  function readRetryAfterSeconds(response: Response, body: unknown): number {
    const header = response.headers.get("retry-after");
    if (header !== null) {
      const parsedHeader = Number.parseInt(header, 10);
      if (Number.isSafeInteger(parsedHeader) && parsedHeader > 0) {
        return parsedHeader;
      }
    }
    if (isRecord(body) && isRecord(body.details)) {
      const value = body.details.retryAfterSeconds;
      if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
        return value;
      }
    }
    return 1;
  }

  function parseJsonResponse(text: string): unknown {
    if (text.trim().length === 0) {
      return {};
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { raw: text.slice(0, 500) };
    }
  }

  function safeHttpErrorBody(body: unknown): string {
    const serialized = JSON.stringify(body);
    return serialized.length > 1_000
      ? `${serialized.slice(0, 1_000)}...`
      : serialized;
  }

  return { pollJson, requestStatus, requestJsonWithContext, requestJson };
}
