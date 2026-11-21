import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const headersFor = (source) => Object.fromEntries(config.headers.find((h) => h.source === source).headers.map((h) => [h.key, h.value]));
const all = headersFor('/(.*)');
const csp = Object.fromEntries(all['Content-Security-Policy'].split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values]));

test('every page gets the security headers', () => {
  assert.equal(all['X-Content-Type-Options'], 'nosniff');
  assert.equal(all['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(all['X-Frame-Options'], 'DENY');
  assert.match(all['Permissions-Policy'], /microphone=\(self\)/);
  assert.match(all['Permissions-Policy'], /camera=\(self\)/);
});

test('the CSP allows only what the page needs, and every inline script is hashed', () => {
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(inline.length >= 1);
  for (const body of inline) assert.ok(csp['script-src'].includes(`'sha256-${createHash('sha256').update(body).digest('base64')}'`), `inline script not hashed: ${body.slice(0, 40)}`);
  assert.ok(!csp['script-src'].includes("'unsafe-inline'"));
  const apiBase = readFileSync(new URL('../config.js', import.meta.url), 'utf8').match(/'(https:\/\/[^']+onrender\.com)'/)[1];
  assert.ok(csp['connect-src'].includes(apiBase) && csp['connect-src'].includes(apiBase.replace('https://', 'wss://')));
  assert.ok(csp['script-src'].includes('https://accounts.google.com/gsi/client'));
  assert.ok(csp['frame-src'].includes('https://accounts.google.com'));
  assert.deepEqual(csp['frame-ancestors'], ["'none'"]);
});

test('vendor scripts and fonts are cached for a year', () => {
  for (const source of ['/vendor/(.*)', '/fonts/(.*)']) assert.match(headersFor(source)['Cache-Control'], /max-age=31536000/);
});
