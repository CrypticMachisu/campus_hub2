/**
 * Shared helpers. Everything here is derived from the CampusHub contract
 * (openapi.yaml), not from the implementation.
 *
 * Modes:
 *   - In-process : tests import ../../app (adjust the path if app.js lives in src/)
 *   - Live server: set BASE_URL=http://localhost:5000 (or a partner's URL)
 *
 * Env vars:
 *   BASE_URL    optional, host only, no /v1
 *   API_PREFIX  optional, defaults to /v1
 *   API_KEY     required for POST/PUT/DELETE tests (same value your server expects)
 */
const request = require('supertest');

const PREFIX = process.env.API_PREFIX || '/v1';
const API_KEY = process.env.API_KEY;
const target = process.env.BASE_URL || require('../../app');

const url = (path) => `${PREFIX}${path}`;
const qs = (params) => `?${new URLSearchParams(params)}`; // encodes "+" in +03:00 correctly

function call(method, path, { key = API_KEY, body } = {}) {
  let req = request(target)[method](url(path));
  if (key) req = req.set('X-API-Key', key);
  if (body !== undefined) req = req.send(body);
  return req;
}
const get = (path) => call('get', path, { key: null });
const eventPath = (id) => `/events/${encodeURIComponent(id)}`;

function requireApiKey() {
  if (!API_KEY) {
    throw new Error('API_KEY is not set. PowerShell: $env:API_KEY="your-key"; npx jest');
  }
}

/* ---------- shape assertions ---------- */
const EAT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?\+03:00$/;
const strOrNull = (v) => v === null || typeof v === 'string';
const sameInstant = (a, b) => Date.parse(a) === Date.parse(b);
const without = (obj, ...keys) => {
  const copy = { ...obj };
  keys.forEach((k) => delete copy[k]);
  return copy;
};

function expectClub(c) {
  ['id', 'name', 'description', 'category', 'logoUrl', 'meetingTime', 'meetingLocation', 'tags']
    .forEach((k) => expect(c).toHaveProperty(k));
  expect(typeof c.id).toBe('string');
  expect(typeof c.name).toBe('string');
  expect(typeof c.category).toBe('string');
  ['description', 'logoUrl', 'meetingTime', 'meetingLocation']
    .forEach((k) => expect(strOrNull(c[k])).toBe(true));
  expect(Array.isArray(c.tags)).toBe(true);
  c.tags.forEach((t) => expect(typeof t).toBe('string'));
}

function expectEvent(e) {
  ['id', 'clubId', 'title', 'description', 'category', 'startTime', 'location', 'imageUrl']
    .forEach((k) => expect(e).toHaveProperty(k));
  expect(typeof e.id).toBe('string');
  expect(e.id.length).toBeGreaterThan(0);
  expect(typeof e.clubId).toBe('string');
  expect(typeof e.title).toBe('string');
  expect(typeof e.category).toBe('string');
  expect(e.startTime).toMatch(EAT_TIMESTAMP);          // must be returned in +03:00
  expect(Number.isNaN(Date.parse(e.startTime))).toBe(false);
  ['description', 'location', 'imageUrl'].forEach((k) => expect(strOrNull(e[k])).toBe(true));
}

function expectPage(body, itemCheck) {
  expect(Array.isArray(body.data)).toBe(true);
  ['page', 'limit', 'total'].forEach((k) => expect(Number.isInteger(body[k])).toBe(true));
  body.data.forEach(itemCheck);
}

function expectError(res, status, code) {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/json/);
  expect(typeof res.body.error).toBe('string');
  expect(typeof res.body.message).toBe('string');
  expect(res.body.message.length).toBeGreaterThan(0);
  if (code) expect(res.body.error).toBe(code);
}

/* ---------- fixtures (discovered from the API, so no hard-coded seed ids) ---------- */
async function loadFixtures() {
  const res = await get('/clubs?limit=100');
  expect(res.status).toBe(200);
  const clubs = res.body.data;
  if (!clubs.length) throw new Error('The API has no clubs; seed at least one club before testing.');
  return { clubs, club: clubs[0], category: clubs[0].category };
}

const newEventBody = (fx, overrides = {}) => ({
  clubId: fx.club.id,
  title: `[jest] Test event ${Date.now()}`,
  description: 'Created by the automated test suite.',
  category: fx.category,
  startTime: '2031-05-05T10:00:00+03:00',   // far future so it never collides with real data
  location: 'Test Hall',
  ...overrides,
});

/* ---------- cleanup: every event a test creates is deleted afterwards ---------- */
const created = [];
const trackCreated = (id) => created.push(id);

async function createEvent(fx, overrides = {}) {
  const res = await call('post', '/events', { body: newEventBody(fx, overrides) });
  if (res.status === 201 && res.body && res.body.id) trackCreated(res.body.id);
  expect(res.status).toBe(201);
  return res.body;
}

async function cleanupCreated() {
  while (created.length) {
    const id = created.pop();
    try { await call('delete', eventPath(id)); } catch { /* best effort */ }
  }
}

module.exports = {
  request, target, url, qs, call, get, eventPath, requireApiKey,
  strOrNull, sameInstant, without,
  expectClub, expectEvent, expectPage, expectError,
  loadFixtures, newEventBody, createEvent, trackCreated, cleanupCreated,
};
