import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const port = 4173;
const mimeTypes = Object.freeze({'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8'});
const exactFiles = new Set([
  '/src/nxt/event-timeline.js',
  '/src/nxt/review-export-contract.js',
  '/src/nxt/review-queue-contract.js'
]);

function isAllowed(pathname) {
  return pathname.startsWith('/preview/nxt/') || exactFiles.has(pathname);
}

const server = http.createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, {'Allow': 'GET, HEAD', 'Cache-Control': 'no-store'}).end('method not allowed');
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, `http://${host}:${port}`).pathname); }
  catch { response.writeHead(400).end('bad request'); return; }
  if (pathname.includes('\\') || pathname.split('/').includes('..') || !isAllowed(pathname)) {
    response.writeHead(404, {'Cache-Control': 'no-store'}).end('not found');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const filename = path.resolve(root, `.${pathname}`);
  const relative = path.relative(root, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(404, {'Cache-Control': 'no-store'}).end('not found');
    return;
  }
  fs.stat(filename, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404, {'Cache-Control': 'no-store'}).end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filename)] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(filename).pipe(response);
  });
});

server.listen(port, host, () => console.log(`NXT mock preview server listening on http://${host}:${port}/preview/nxt/`));
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
