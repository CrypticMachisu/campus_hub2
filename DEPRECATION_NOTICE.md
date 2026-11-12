# Deprecation notice: Events API v1

**To:** Team 8, our downstream consumer · **From:** CampusHub API, Team 7 · **Date:** 12 November 2026

## Summary

v1 of the events endpoints is deprecated. **v2 is live now** at `/api/v2/events`. v1 — both `/api/events` and `/api/v1/events` — keeps working and now sends deprecation headers on every response. It will stop working on **30 November 2026**. Please move before Demo Day (19 November 2026).

## What is changing

- Each event's **`date` (`"YYYY-MM-DD"`) and `time` (`"HH:MM"`) are replaced by one `startTime`**, an ISO 8601 timestamp with an explicit `+03:00` offset: `"2026-11-02T06:30:00+03:00"`.
- The `{ "events": [ ... ] }` envelope stays. So do `id`, `clubId`, `title`, `description`, `category`, `location`, `imageUrl`, `bringNote`, `capacity`, `signupCount` and `isSeed`.
- Request bodies do not change: `POST` and `PUT` still accept `date` + `time`, and still accept `startTime`. Your API key, rate limit, error bodies and every other endpoint (clubs, auth, signups, comments) are unchanged — under `/api/v2` they answer exactly as before.

## Why

We were sending a date and a clock time with no timezone. A server running outside East Africa returned event dates a day early (it is in our README under Known issues), and every consumer had to glue two fields together before it could sort or compare events. One timestamp with a real offset removes both problems, and it gives us one field to extend later (an end time) without another break.

## Before and after

v1 — `GET /api/events`

```json
{
  "events": [
    {
      "id": "event-05",
      "clubId": "club-03",
      "title": "River Trail 5K",
      "description": "A social 5K along the river trail, coffee after at the Rec Center.",
      "category": "Sports & Fitness",
      "date": "2026-10-12",
      "time": "06:30",
      "location": "Rec Center steps",
      "imageUrl": "https://images.unsplash.com/...",
      "bringNote": "",
      "capacity": null,
      "signupCount": 12,
      "isSeed": true
    }
  ]
}
```

v2 — `GET /api/v2/events`

```json
{
  "events": [
    {
      "id": "event-05",
      "clubId": "club-03",
      "title": "River Trail 5K",
      "description": "A social 5K along the river trail, coffee after at the Rec Center.",
      "category": "Sports & Fitness",
      "startTime": "2026-10-12T06:30:00+03:00",
      "location": "Rec Center steps",
      "imageUrl": "https://images.unsplash.com/...",
      "bringNote": "",
      "capacity": null,
      "signupCount": 12,
      "isSeed": true
    }
  ]
}
```

## How to migrate

1. Call `/api/v2/events` instead of `/api/events` (and `/api/v2/events/{id}` for `PUT`/`DELETE`). Same key, same rate limit.
2. Read `event.startTime` where you read `event.date` / `event.time`.
3. If you need a `Date`, use `new Date(event.startTime)`. Do not concatenate the old two fields.
4. If you only need the calendar day, take `event.startTime.slice(0, 10)` — that is the day in `+03:00`, matching what v1 reported.
5. Anything that needs a date + time pair (form prefill, calendar export) splits `startTime` back into them in one place, not in every page.
6. Test it, then tell me — I will check `/stats` and the request log for your calls on `/api/v2/events`.

## Timeline

- **Today, 12 November 2026:** v2 is live. v1 still works and sends `Deprecation: true`, `Sunset` and `Link` headers on every events response.
- **19 November 2026 (Demo Day):** both demos should be running on v2.
- **30 November 2026, 03:00 EAT:** v1 is removed. `/api/events` and `/api/v1/events` then answer `404` with `{"error":"Not found."}` — the same JSON body as any unknown path, not a special "gone" response. Test for that status rather than for a timeout. The `Sunset` header reads `Mon, 30 Nov 2026 00:00:00 GMT`, which is 03:00 in `+03:00`: the same moment.

v1 stays running past Demo Day on purpose, so nobody's demo breaks. The sunset above is the date we mean; if it is a problem, tell me and we will move it in writing.

## Questions

Message me any time and I will reply within 24 hours. If something in this notice does not match what the API actually returns, tell me before you change your code — that is a bug on our side, not yours.
