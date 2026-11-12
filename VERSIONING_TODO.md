# Versioning lab — what is left for you to do

**Updated:** 12 November 2026, after the live run on XAMPP MariaDB 10.11 · **Repo:** `github.com/CrypticMachisu/campus_hub2` · **Branch:** `main` = `week13-api-versioning`

The database is up and the handout's evidence is now captured for real: old code vs new code against 13 seeded events, empty diff, three URLs called over HTTP, headers checked, `/stats` read, full server suite 30/30. Details and the reproduce commands are in `VERSIONING_NOTES.md` §10.

What is left needs a person, another team, or a decision — not a database.

**Rubric position:** ~19 of 25 points evidenced. The 8 points for Part E (migrating to the upstream v2) stay unearned until Team 6 publishes a v2. The 6 points for the notice are still "written, not sent".

---

## ☐ 1. Send the deprecation notice to Team 8 — the last scored item in your control

- **Send:** the full `DEPRECATION_NOTICE.md` text (not just a link), plus `RING_BULLETIN.md`.
- **Where:** your ring channel with Team 8.
- **Ask for:** a one-line reply — _"read it, we will move to `/api/v2` by `<date>`"_ — and the **file:line** where their Week 10 integration reads `event.date` / `event.time`.

Then update `INTEGRATION_LOG.md`, Week 13, replacing:

```
- [ ] Send the full DEPRECATION_NOTICE.md text to Team 8 … and get a reply.
```

with the date, channel and reply. **Done when** the reply exists in writing; a notice that only lives in git earns nothing.

## ☐ 2. Chase Team 6 (AgroConnect) about their v2 — 8 points sit here

One message, four questions:

1. Do you have a **v2**? Contract: field list, one example body, base URL.
2. A **test API key** for it.
3. Your **versioning policy** — notice period before a breaking change, and how you announce it.
4. A **notice channel**: one named person and a thread we can reply to. Their reads became key-only on 8 November with no notice; we found out from a `401` in our own log.

If a real v2 arrives, that is about an hour of work: a versions table in `server/routes/partner.js`, `PARTNER_VERSION=v1` scaffolded in `server/.env.example`, `server/tests/partner.test.js` with one parser test per version, then flip the env var and confirm `/api/partner/*` answers `"stale": false`. **Do not pre-build it** against a guessed contract.

**Done when:** a real v2 body is parsed by a test, or Team 6 states in writing that no v2 exists — both are legitimate answers to record.

## ☐ 3. Decide about our own front end — deadline 30 November

We are still a v1 consumer. `VERSIONING_NOTES.md` §3 lists every line that breaks, starting with `src/utils/dateTime.js`.

- **Migrate:** read `event.startTime`, `new Date(...)`. Roughly a dozen lines.
- **Or accept the break:** event pages go blank at the sunset.

Either is defensible; drifting into 30 November is not. **Done when** the front end reads `startTime`, or the decision is written down as deliberate.

## ☐ 4. Read `/stats` and the log on the deployment before switching v1 off

Locally the three paths already show up as separate rows (`GET /api/events/`, `GET /api/v1/events/`, `GET /api/v2/events/`). On the deployed API those counts belong to real callers, so that is the number that says whether Team 8 has actually moved. **Done when** the deployed rows are recorded in `VERSIONING_NOTES.md` §4.

## ☐ 5. Optional, and worth doing soon: fix the off-by-one properly

The live run showed `event-05` stored as `2026-11-13` but returned as `2026-11-12` on this UTC+3 machine — in **both** versions, because `server/rowMappers.js:73-75` formats a local-midnight `Date` with `toISOString()`. v2 inherits it; the `+03:00` offset makes it visible, not fixed (`VERSIONING_NOTES.md` §12).

This was deliberately **not** fixed inside the versioning change, because it changes v1's values and would have broken the "diff prints nothing" promise. It belongs in its own announced change: build `YYYY-MM-DD` from `getFullYear()` / `getMonth()` / `getDate()`, tell consumers it is a data fix affecting both versions, re-run the diff.

## ☐ 6. Optional, only if your marker wants Jest specifically

The handout says `npx jest`; the repo's root Jest setup cannot run — `jest.config.js` is CommonJS inside a `"type": "module"` package, and the root `__tests__` harness imports an `app.js` that does not exist. The version tests live in `server/tests/versions.test.mjs` and run with `node --test` (9/9), the whole suite 30/30. Reasons are in `VERSIONING_NOTES.md` §11.

---

## Already done — for the record

| Requirement                                  | Where                                     | Status                   |
| -------------------------------------------- | ----------------------------------------- | ------------------------ |
| `/v2` new shape, `/v1` and old URL old shape | `server/v2.js`, `server/v1.js`            | done                     |
| Handlers unchanged (move, don't edit)        | `server/routes/events.js` untouched       | done                     |
| Deprecation headers on v1 only               | `server/deprecate.js`                     | done                     |
| v2 still needs an API key                    | `server/app.js`                           | done                     |
| `v1_before.json` vs `v1_after.json` diff     | empty, exit 0, 13 events                  | done                     |
| Three URLs called live                       | before: 404 / 404; after: 200 / 200 / 200 | done                     |
| `/stats` separates the versions              | three distinct rows observed              | done here                |
| Tests                                        | 9/9 version suite, 30/30 full suite       | done                     |
| Notice written                               | `DEPRECATION_NOTICE.md`                   | done — sending is step 1 |
| Reflection 150–250 words                     | §7, 223 words                             | done                     |
| `.env` not committed                         | gitignored, local only                    | done                     |
| Committed and pushed                         | `main` = `week13-api-versioning`          | done                     |
| Upstream migration (Part E)                  | needs Team 6                              | step 2                   |

**If you do only one thing:** step 1. The notice is the difference between a partner that migrates in time and a demo that breaks on 19 November.
