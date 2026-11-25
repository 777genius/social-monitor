#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { URL } from 'node:url';

const root = resolve(
  process.env.FRONTEND_WEB_ROOT ?? 'apps/frontend/app/build/web',
);
const indexPath = join(root, 'index.html');

if (!existsSync(indexPath)) {
  throw new Error(`Flutter web index.html not found: ${indexPath}`);
}

const server = createServer((request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { allow: 'GET,HEAD' });
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  const assetPath = resolveAssetPath(url.pathname);
  if (assetPath === null) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  if (request.method === 'HEAD') {
    response.writeHead(200, responseHeaders(assetPath));
    response.end();
    return;
  }

  response.writeHead(200, responseHeaders(assetPath));
  createReadStream(assetPath).pipe(response);
});

const requestedPort = Number.parseInt(
  process.env.FRONTEND_WEB_PREVIEW_PORT ?? '0',
  10,
);
const listenPort =
  Number.isInteger(requestedPort) && requestedPort >= 0 ? requestedPort : 0;

server.listen(listenPort, '127.0.0.1', () => {
  const address = server.address();
  const port =
    typeof address === 'object' && address !== null ? address.port : 0;
  console.log(
    JSON.stringify({
      status: 'ready',
      url: `http://127.0.0.1:${port}`,
      root,
      fallback: 'index.html',
    }),
  );
});

const shutdown = () => {
  server.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

function resolveAssetPath(pathname) {
  const decodedPath = safeDecodePath(pathname);
  const relativePath = decodedPath === '/' ? '/index.html' : decodedPath;
  const candidate = resolve(root, `.${relativePath}`);
  if (!isInsideRoot(candidate)) {
    return null;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  const directoryIndex = join(candidate, 'index.html');
  if (existsSync(directoryIndex) && statSync(directoryIndex).isFile()) {
    return directoryIndex;
  }
  if (extname(decodedPath) === '') {
    return indexPath;
  }
  return null;
}

function safeDecodePath(pathname) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return '/';
  }
}

function isInsideRoot(path) {
  return path === root || path.startsWith(`${root}${sep}`);
}

function responseHeaders(path) {
  return {
    'content-type': contentType(path),
    'cache-control': 'no-store',
  };
}

function contentType(path) {
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.otf': 'font/otf',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    }[extname(path)] ?? 'application/octet-stream'
  );
}
