const {
  get, qs, expectClub, expectPage, expectError, loadFixtures,
} = require('./helpers/api');

const BAD_QUERIES = [
  'limit=0', 'limit=101', 'limit=-1', 'limit=abc', 'limit=1.5',
  'page=0', 'page=abc', 'page=1000001',
  'serach=robotics', // typo'd parameter must fail loudly
];

describe('GET /clubs', () => {
  let fx;
  beforeAll(async () => { fx = await loadFixtures(); });

  // ---- happy path ----
  it('is public and returns a paginated page with the documented shape', async () => {
    const res = await get('/clubs');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expectPage(res.body, expectClub);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.total).toBeGreaterThanOrEqual(res.body.data.length);
  });

  it('sorts clubs by name A to Z (case-insensitive)', async () => {
    const res = await get('/clubs?limit=100');
    const names = res.body.data.map((c) => c.name.toLowerCase());
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('honours limit and reports it back', async () => {
    const res = await get('/clubs?limit=1');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(1);
    expect(res.body.data.length).toBeLessThanOrEqual(1);
  });

  it('accepts the maximum limit of 100', async () => {
    const res = await get('/clubs?limit=100');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
    expect(res.body.data.length).toBeLessThanOrEqual(100);
  });

  it('paginates: page 2 differs from page 1 and total stays constant', async () => {
    const p1 = await get('/clubs?page=1&limit=1');
    if (p1.body.total < 2) return; // nothing to paginate with only one club
    const p2 = await get('/clubs?page=2&limit=1');
    expect(p2.status).toBe(200);
    expect(p2.body.page).toBe(2);
    expect(p2.body.data[0].id).not.toBe(p1.body.data[0].id);
    expect(p2.body.total).toBe(p1.body.total);
  });

  // ---- search / category ----
  it('search is case-insensitive over the club name', async () => {
    for (const term of [fx.club.name.toUpperCase(), fx.club.name.toLowerCase()]) {
      const res = await get(`/clubs${qs({ search: term, limit: 100 })}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((c) => c.id)).toContain(fx.club.id);
    }
  });

  it('search also matches tags', async () => {
    const tagged = () => fx.clubs.find((c) => c.tags.length > 0);
    if (!tagged()) return; // no club has tags in this dataset
    const club = tagged();
    const res = await get(`/clubs${qs({ search: club.tags[0], limit: 100 })}`);
    expect(res.body.data.map((c) => c.id)).toContain(club.id);
  });

  it('category filter is an exact, case-insensitive match', async () => {
    const res = await get(`/clubs${qs({ category: fx.category.toUpperCase(), limit: 100 })}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    res.body.data.forEach((c) => expect(c.category.toLowerCase()).toBe(fx.category.toLowerCase()));
    expect(res.body.data.map((c) => c.id)).toContain(fx.club.id);
  });

  it('filters combine with AND', async () => {
    const both = await get(`/clubs${qs({ search: fx.club.name, category: fx.category, limit: 100 })}`);
    expect(both.body.data.map((c) => c.id)).toContain(fx.club.id);
    const conflicting = await get(`/clubs${qs({ search: fx.club.name, category: 'NoSuchCategory-xyz' })}`);
    expect(conflicting.status).toBe(200);
    expect(conflicting.body.data).toEqual([]);
  });

  // ---- edge cases ----
  it('unknown category returns an empty list, not an error', async () => {
    const res = await get('/clubs?category=NoSuchCategory-xyz');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('a search with no matches returns an empty page', async () => {
    const res = await get('/clubs?search=zzzzqqqqxxxx');
    expect(res.status).toBe(200);
    expectPage(res.body, expectClub);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('the maximum page number (1000000) returns 200 with an empty page', async () => {
    const res = await get('/clubs?page=1000000');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.page).toBe(1000000);
  });

  // ---- validation ----
  it.each(BAD_QUERIES)('rejects ?%s with 400 and {error, message}', async (query) => {
    expectError(await get(`/clubs?${query}`), 400);
  });
});

describe('GET /clubs/:id', () => {
  let fx;
  beforeAll(async () => { fx = await loadFixtures(); });

  it('returns the club, identical to its list entry', async () => {
    const res = await get(`/clubs/${encodeURIComponent(fx.club.id)}`);
    expect(res.status).toBe(200);
    expectClub(res.body);
    expect(res.body).toEqual(fx.club);
  });

  it('returns 404 not_found for an id that does not exist', async () => {
    expectError(await get('/clubs/club-does-not-exist'), 404, 'not_found');
  });

  it('returns 404 (not a 500) for an absurdly long id', async () => {
    expectError(await get(`/clubs/${'x'.repeat(500)}`), 404, 'not_found');
  });
});
