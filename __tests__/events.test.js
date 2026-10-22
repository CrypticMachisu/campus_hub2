const {
  get, call, qs, eventPath, requireApiKey, request, target, url,
  sameInstant, without,
  expectEvent, expectPage, expectError,
  loadFixtures, newEventBody, createEvent, trackCreated, cleanupCreated,
} = require('./helpers/api');

const API_KEY = process.env.API_KEY;
const BAD_QUERIES = [
  'limit=0', 'limit=101', 'limit=abc', 'page=0', 'page=abc', 'page=1000001',
  'from=not-a-date', 'to=2026-13-45T00:00:00+03:00',
  'clubld=club-01', // typo'd parameter must fail loudly
];

let fx;
let seedEvent; // an event NOT created through the partner API (read-only for Team 8)

beforeAll(async () => {
  requireApiKey();
  fx = await loadFixtures();
  const res = await get('/events?limit=100');
  // Assumption: partner-created ids start with "custom-" (contract example). Adjust if yours differ.
  seedEvent = res.body.data.find((e) => !e.id.startsWith('custom-'));
});
afterAll(cleanupCreated);

/* ============================== GET /events ============================== */
describe('GET /events', () => {
  it('is public and returns a paginated page with the documented shape', async () => {
    const res = await get('/events');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expectPage(res.body, expectEvent);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('sorts by startTime, earliest first', async () => {
    const res = await get('/events?limit=100');
    const times = res.body.data.map((e) => Date.parse(e.startTime));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('honours limit and page', async () => {
    const res = await get('/events?limit=1');
    expect(res.body.limit).toBe(1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
    const last = await get('/events?page=1000000');
    expect(last.status).toBe(200);
    expect(last.body.data).toEqual([]);
  });

  it('clubId filter returns only that club\'s events, including a newly created one', async () => {
    const ev = await createEvent(fx);
    const res = await get(`/events${qs({ clubId: fx.club.id, limit: 100 })}`);
    expect(res.status).toBe(200);
    res.body.data.forEach((e) => expect(e.clubId).toBe(fx.club.id));
    expect(res.body.data.map((e) => e.id)).toContain(ev.id);
  });

  it('from/to are inclusive boundaries and understand any UTC offset', async () => {
    const at = '2031-05-05T10:00:00+03:00';
    const ev = await createEvent(fx, { startTime: at });
    const ids = async (params) =>
      (await get(`/events${qs({ clubId: fx.club.id, limit: 100, ...params })}`)).body.data.map((e) => e.id);

    expect(await ids({ from: at })).toContain(ev.id);                          // starts AT from
    expect(await ids({ to: at })).toContain(ev.id);                            // starts AT to
    expect(await ids({ from: '2031-05-05T07:00:00Z' })).toContain(ev.id);     // same instant in UTC
    expect(await ids({ from: '2031-05-05T10:00:01+03:00' })).not.toContain(ev.id);
    expect(await ids({ to: '2031-05-05T09:59:59+03:00' })).not.toContain(ev.id);
  });

  it('a window with no events returns an empty page', async () => {
    const res = await get(`/events${qs({ from: '2999-01-01T00:00:00+03:00' })}`);
    expect(res.status).toBe(200);
    expectPage(res.body, expectEvent);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('unknown clubId returns an empty list (contract is silent; mirrors category behaviour)', async () => {
    const res = await get('/events?clubId=club-does-not-exist');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it.each(BAD_QUERIES)('rejects ?%s with 400 and {error, message}', async (query) => {
    expectError(await get(`/events?${query}`), 400);
  });
});

/* ============================ GET /events/:id ============================ */
describe('GET /events/:id', () => {
  it('returns the event, identical to what POST returned', async () => {
    const ev = await createEvent(fx);
    const res = await get(eventPath(ev.id));
    expect(res.status).toBe(200);
    expectEvent(res.body);
    expect(res.body).toEqual(ev);
  });

  it('returns 404 not_found for an id that does not exist', async () => {
    expectError(await get('/events/event-does-not-exist'), 404, 'not_found');
  });

  it('returns 404 (not a 500) for an absurdly long id', async () => {
    expectError(await get(`/events/${'x'.repeat(500)}`), 404, 'not_found');
  });
});

/* ============================== POST /events ============================= */
describe('POST /events', () => {
  const INVALID = [
    ['a missing title',                      (b) => without(b, 'title')],
    ['an empty title',                       (b) => ({ ...b, title: '' })],
    ['a whitespace-only title',              (b) => ({ ...b, title: '   ' })],
    ['a title over 150 characters',          (b) => ({ ...b, title: 'x'.repeat(151) })],
    ['a title of the wrong type',            (b) => ({ ...b, title: 123 })],
    ['a missing clubId',                     (b) => without(b, 'clubId')],
    ['an unknown clubId',                    (b) => ({ ...b, clubId: 'club-does-not-exist' })],
    ['a missing category',                   (b) => without(b, 'category')],
    ['an unknown category',                  (b) => ({ ...b, category: 'Nope' })],
    ['a missing startTime',                  (b) => without(b, 'startTime')],
    ['a malformed startTime',                (b) => ({ ...b, startTime: 'not-a-date' })],
    ['a startTime without a UTC offset',     (b) => ({ ...b, startTime: '2031-06-01T14:00:00' })],
    ['a startTime with year below 1000',     (b) => ({ ...b, startTime: '0999-01-01T00:00:00+03:00' })],
    ['a location over 150 characters',       (b) => ({ ...b, location: 'x'.repeat(151) })],
  ];

  it('returns 401 unauthorized without an API key', async () => {
    expectError(await call('post', '/events', { key: null, body: newEventBody(fx) }), 401, 'unauthorized');
  });

  it('returns 401 unauthorized with a wrong API key', async () => {
    expectError(await call('post', '/events', { key: 'wrong-key', body: newEventBody(fx) }), 401, 'unauthorized');
  });

  it('creates an event (201) and echoes every field it was given', async () => {
    const body = newEventBody(fx, { imageUrl: 'https://example.com/poster.png' });
    const res = await call('post', '/events', { body });
    if (res.status === 201) trackCreated(res.body.id);
    expect(res.status).toBe(201);
    expectEvent(res.body);
    expect(res.body).toMatchObject({
      clubId: body.clubId, title: body.title, description: body.description,
      category: body.category, location: body.location, imageUrl: body.imageUrl,
    });
    expect(sameInstant(res.body.startTime, body.startTime)).toBe(true);
  });

  it('the new event is then readable via GET /events/:id and GET /events', async () => {
    const ev = await createEvent(fx);
    const one = await get(eventPath(ev.id));
    expect(one.body).toEqual(ev);
    const list = await get(`/events${qs({ clubId: fx.club.id, limit: 100 })}`);
    expect(list.body.data.map((e) => e.id)).toContain(ev.id);
  });

  it('accepts only the required fields (description, location, imageUrl optional)', async () => {
    const ev = await createEvent(fx, { description: undefined, location: undefined });
    expectEvent(ev);
  });

  it('converts any UTC offset to +03:00 without changing the instant', async () => {
    const sent = '2031-06-01T11:00:00Z';
    const ev = await createEvent(fx, { startTime: sent });
    expect(ev.startTime).toMatch(/\+03:00$/);
    expect(sameInstant(ev.startTime, sent)).toBe(true);
  });

  it('accepts a title of exactly 150 characters (boundary)', async () => {
    const ev = await createEvent(fx, { title: 'x'.repeat(150) });
    expect(ev.title).toHaveLength(150);
  });

  it.each(INVALID)('rejects %s with 400 validation_error', async (_label, mutate) => {
    const res = await call('post', '/events', { body: mutate(newEventBody(fx)) });
    if (res.status === 201) trackCreated(res.body.id); // don't leak an event if validation is missing
    expectError(res, 400, 'validation_error');
  });

  it('rejects an empty JSON body with 400', async () => {
    expectError(await call('post', '/events', { body: {} }), 400, 'validation_error');
  });

  it('rejects malformed JSON with 400 and {error, message}', async () => {
    const res = await request(target).post(url('/events'))
      .set('X-API-Key', API_KEY).set('Content-Type', 'application/json').send('{"title": ');
    expectError(res, 400);
  });
});

/* ============================ PUT /events/:id ============================ */
describe('PUT /events/:id', () => {
  const update = (overrides = {}) => ({
    title: '[jest] Updated title',
    category: fx.category,
    startTime: '2031-07-01T09:00:00+03:00',
    ...overrides,
  });

  it('returns 401 without or with a wrong API key', async () => {
    const ev = await createEvent(fx);
    expectError(await call('put', eventPath(ev.id), { key: null, body: update() }), 401, 'unauthorized');
    expectError(await call('put', eventPath(ev.id), { key: 'wrong-key', body: update() }), 401, 'unauthorized');
  });

  it('fully replaces editable fields: omitted optional fields are cleared', async () => {
    const ev = await createEvent(fx, { description: 'has one', location: 'has one', imageUrl: 'https://example.com/a.png' });
    const res = await call('put', eventPath(ev.id), { body: update() });
    expect(res.status).toBe(200);
    expectEvent(res.body);
    expect(res.body.id).toBe(ev.id);
    expect(res.body.clubId).toBe(ev.clubId);            // hosting club is fixed
    expect(res.body.title).toBe('[jest] Updated title');
    expect(sameInstant(res.body.startTime, '2031-07-01T09:00:00+03:00')).toBe(true);
    expect(res.body.description).toBeNull();
    expect(res.body.location).toBeNull();
    expect(res.body.imageUrl).toBeNull();
    expect((await get(eventPath(ev.id))).body).toEqual(res.body);   // persisted
  });

  it('updates optional fields when they are supplied', async () => {
    const ev = await createEvent(fx);
    const res = await call('put', eventPath(ev.id), {
      body: update({ description: 'new desc', location: 'New Hall', imageUrl: 'https://example.com/b.png' }),
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ description: 'new desc', location: 'New Hall', imageUrl: 'https://example.com/b.png' });
  });

  it('never moves the event to a different club', async () => {
    const other = fx.clubs.find((c) => c.id !== fx.club.id);
    if (!other) return; // needs two clubs
    const ev = await createEvent(fx);
    const res = await call('put', eventPath(ev.id), { body: { ...update(), clubId: other.id } });
    expect([200, 400]).toContain(res.status);           // ignored or rejected, both defensible
    expect((await get(eventPath(ev.id))).body.clubId).toBe(fx.club.id);
  });

  const INVALID = [
    ['a missing title',              (b) => without(b, 'title')],
    ['a whitespace-only title',      (b) => ({ ...b, title: '   ' })],
    ['a title over 150 characters',  (b) => ({ ...b, title: 'x'.repeat(151) })],
    ['a missing category',           (b) => without(b, 'category')],
    ['an unknown category',          (b) => ({ ...b, category: 'Nope' })],
    ['a missing startTime',          (b) => without(b, 'startTime')],
    ['a malformed startTime',        (b) => ({ ...b, startTime: 'not-a-date' })],
  ];

  it.each(INVALID)('rejects %s with 400 and leaves the event unchanged', async (_label, mutate) => {
    const ev = await createEvent(fx);
    const res = await call('put', eventPath(ev.id), { body: mutate(update()) });
    expectError(res, 400, 'validation_error');
    expect((await get(eventPath(ev.id))).body).toEqual(ev);
  });

  it('returns 404 not_found for an id that does not exist', async () => {
    expectError(await call('put', '/events/custom-does-not-exist', { body: update() }), 404, 'not_found');
  });

  it('returns 403 forbidden for an event not created through the partner API, and leaves it unchanged', async () => {
    expect(seedEvent).toBeDefined(); // fails loudly if no read-only event exists to test with
    const res = await call('put', eventPath(seedEvent.id), { body: update() });
    expectError(res, 403, 'forbidden');
    expect((await get(eventPath(seedEvent.id))).body).toEqual(seedEvent);
  });
});

/* =========================== DELETE /events/:id ========================== */
describe('DELETE /events/:id', () => {
  it('returns 401 without or with a wrong API key, and the event survives', async () => {
    const ev = await createEvent(fx);
    expectError(await call('delete', eventPath(ev.id), { key: null }), 401, 'unauthorized');
    expectError(await call('delete', eventPath(ev.id), { key: 'wrong-key' }), 401, 'unauthorized');
    expect((await get(eventPath(ev.id))).status).toBe(200);
  });

  it('deletes with 204 and no body; the event is then gone (404) and a repeat delete is 404', async () => {
    const ev = await createEvent(fx);
    const res = await call('delete', eventPath(ev.id));
    expect(res.status).toBe(204);
    expect(res.text || '').toBe('');
    expectError(await get(eventPath(ev.id)), 404, 'not_found');
    expectError(await call('delete', eventPath(ev.id)), 404, 'not_found');
    const list = await get(`/events${qs({ clubId: fx.club.id, limit: 100 })}`);
    expect(list.body.data.map((e) => e.id)).not.toContain(ev.id);
  });

  it('returns 404 not_found for an id that does not exist', async () => {
    expectError(await call('delete', '/events/custom-does-not-exist'), 404, 'not_found');
  });

  it('returns 403 forbidden for an event not created through the partner API, and it survives', async () => {
    expect(seedEvent).toBeDefined();
    expectError(await call('delete', eventPath(seedEvent.id)), 403, 'forbidden');
    expect((await get(eventPath(seedEvent.id))).body).toEqual(seedEvent);
  });
});
