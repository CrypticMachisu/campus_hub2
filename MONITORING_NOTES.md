# CampusHub API — monitoring notes

Week 12. Part A decides what the log may contain and records two predictions
about our own API before looking at any numbers; Part E compares those
predictions with the real traffic. Nothing here is invented after the fact —
the predictions below were written from how the API is built, and Part E will
say plainly where they were wrong.

## What gets logged, and what never does

A log line is cheap to copy, paste into a chat and commit by accident, so the
rule is settled before any code writes one.

| Log this                               | Never log this                                           |
| -------------------------------------- | -------------------------------------------------------- |
| Timestamp                              | API keys or tokens, even partly                          |
| HTTP method and path (path only)       | Passwords                                                |
| Status code                            | Request or response bodies                               |
| Response time in milliseconds          | Query strings (they carry emails, names, reset tokens)   |
| A short fingerprint of the calling key | Anything a caller would object to seeing in a screenshot |

Path vs URL is deliberate: the logger records `req.path`, never
`req.originalUrl`, so `/api/comments?targetType=club&targetId=club-07` is
logged as `/api/comments`. Nothing in `monitoring.js` reads headers, bodies or
query parameters.

**Who called, without keeping the key.** `who(req)` hashes the key with SHA-256
and keeps six characters: `key-9220a7`. The same key always produces the same
label, so our traffic and a partner's traffic can be told apart, and the label
cannot be turned back into the key. Requests that present no key at all are
labelled `none` — which is also how probing shows up.

## Predictions, before the numbers

**1. Slowest endpoint: `GET /api/partner/produce`.**

Every other read is a single MySQL query on a small table. This one leaves the
process: it calls Team 6's AgroConnect API from our server and reshapes the
result. Its response time is therefore whatever theirs is, plus network time,
and we already saw the partner's cold start take several seconds. I expect it
to have both the highest average and the worst single request, with
`GET /api/partner/farmers` close behind for the same reason.

**2. Most errors: `GET /api/signups/event/:eventId`.**

It is the read most likely to be called without a login — a member opens an
event page in a fresh tab and the client asks for signup counts before the
token is sorted. `requireAuth` answers those with 401, so I expect the largest
4xx count on this route, and mostly client errors rather than server errors.
For 5xx I expect the partner routes to be the only source: if AgroConnect
rejects our key or times out, we have nothing to serve and the error is ours to
report.

What I do **not** expect: a meaningful 5xx rate on the database-backed routes.
They either work or the server fails to start, so a 5xx there would be news.

_(Part E will replace this section's speculation with the actual
`/stats` and log figures, including where these two predictions were wrong.)_
