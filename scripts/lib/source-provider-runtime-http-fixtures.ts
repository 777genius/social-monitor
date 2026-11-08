/** Return deterministic HTTP response fixtures for source-provider runtime checks. */
export function jsonResponse(
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

/** Provide a fixed GitHub trending HTML response without network access. */
export function githubTrendingPageHtmlFixture(): string {
  return `
    <main>
      <article>
        <h2>
          <a href="/openai/codex">openai / codex</a>
        </h2>
        <p>AI coding agent CLI and developer workflow tooling.</p>
        <span itemprop="programmingLanguage">TypeScript</span>
        <a href="/openai/codex/stargazers">54,000</a>
        <a href="/openai/codex/forks">5,100</a>
        <span>210 stars today</span>
      </article>
    </main>
  `;
}

/** Read a named header from any HeadersInit representation. */
export function readHeader(
  headers: HeadersInit | undefined,
  name: string,
): string | undefined {
  if (headers === undefined) {
    return undefined;
  }

  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }

  if (Array.isArray(headers)) {
    const entry = headers.find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return entry?.[1];
  }

  const record = headers as Record<string, string>;
  return record[name] ?? record[name.toLowerCase()];
}
