import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { FIXTURES_DIR } from './extension';

/** A strict CSP like real ATS pages use: no inline scripts, no foreign frames. */
export const STRICT_CSP = "default-src 'self'; frame-src 'self'";

async function listen(server: http.Server): Promise<number> {
  // Default host: dual-stack, so "localhost" works whether it resolves to ::1 or 127.0.0.1.
  await new Promise<void>((resolve) => server.listen(0, resolve));
  return (server.address() as AddressInfo).port;
}

async function close(server: http.Server): Promise<void> {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

export interface FixtureServer {
  /** Origin, e.g. http://localhost:51234 (the extension copy has host access to localhost). */
  origin: string;
  /** host:port as shown by the panel's target-page chip. */
  host: string;
  url(pathname: string): string;
  /** Serves `html` at `pathname`. `csp: null` sends no Content-Security-Policy header. */
  serve(pathname: string, html: string, options?: { csp?: string | null }): void;
  close(): Promise<void>;
}

/** Serves tests/fixtures/*.html with a strict CSP, plus pages registered with serve(). */
export async function startFixtureServer(): Promise<FixtureServer> {
  const routes = new Map<string, { html: string; csp: string | null }>();
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const route = routes.get(pathname);
    if (route) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...(route.csp ? { 'content-security-policy': route.csp } : {}) });
      res.end(route.html);
      return;
    }
    const file = path.join(FIXTURES_DIR, path.basename(pathname));
    if (!file.endsWith('.html') || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': STRICT_CSP });
    res.end(fs.readFileSync(file));
  });
  const port = await listen(server);
  const origin = `http://localhost:${port}`;
  return {
    origin,
    host: `localhost:${port}`,
    url: (pathname) => `${origin}/${pathname.replace(/^\//, '')}`,
    serve: (pathname, html, options = {}) => {
      routes.set(`/${pathname.replace(/^\//, '')}`, { html, csp: options.csp === undefined ? STRICT_CSP : options.csp });
    },
    close: () => close(server),
  };
}

export interface OllamaChatRequest {
  model: string;
  stream: boolean;
  format?: string;
  options?: Record<string, unknown>;
  messages: { role: string; content: string }[];
}

export interface OllamaStub {
  /** Base URL to enter as "Ollama URL". */
  baseUrl: string;
  /** Every /api/chat request received, parsed. */
  requests: OllamaChatRequest[];
  close(): Promise<void>;
}

/**
 * Minimal stand-in for Ollama's /api/chat. `reply` returns the assistant
 * message content for each request.
 */
export async function startOllamaStub(reply: (request: OllamaChatRequest) => string): Promise<OllamaStub> {
  const requests: OllamaChatRequest[] = [];
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' };
  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
      return;
    }
    if (req.method !== 'POST' || req.url !== '/api/chat') {
      res.writeHead(404, cors).end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => (body += chunk));
    req.on('end', () => {
      const request = JSON.parse(body) as OllamaChatRequest;
      requests.push(request);
      const content = reply(request);
      res.writeHead(200, { 'content-type': 'application/json', ...cors });
      res.end(JSON.stringify({ model: request.model, message: { role: 'assistant', content }, done: true }));
    });
  });
  const port = await listen(server);
  return { baseUrl: `http://localhost:${port}`, requests, close: () => close(server) };
}
