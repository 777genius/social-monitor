/** Static synthetic Docker fixture. No project app, credentials, external I/O or LLM. */
async function startSyntheticCohortFrontend(): Promise<void> {
  const { createServer } = await import("node:http");
  const { readFileSync } = await import("node:fs");
  const publicFiles: Readonly<Record<string, string>> = {
    "/": "/usr/share/nginx/public/index.html",
    "/favicon.svg": "/usr/share/nginx/public/favicon.svg",
    "/release-sha.txt": "/usr/share/nginx/public/release-sha.txt",
  };
  createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://synthetic.invalid").pathname;
    const file = publicFiles[path];
    if (file === undefined) {
      response.writeHead(404); response.end(); return;
    }
    try {
      const body = readFileSync(file);
      response.writeHead(200, { "Cache-Control": "no-store" });
      response.end(body);
    } catch {
      response.writeHead(404); response.end();
    }
  }).listen(8080, "127.0.0.1");
  createServer((_request, response) => {
    response.writeHead(401); response.end();
  }).listen(8081, "127.0.0.1");
}
void startSyntheticCohortFrontend();
