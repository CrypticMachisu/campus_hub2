# Producer integration note — calling the CampusHub API

For any service that needs CampusHub clubs or events. This is the short version;
the full contract is in [README.md](README.md), [openapi.yaml](openapi.yaml), and the
generated reference at [docs/index.html](docs/index.html).

## Live endpoint

```text
https://movable-eastcoast-showman.ngrok-free.dev/api
```

This is a demo tunnel, not production. It is available while the host machine and
tunnel are running. The bare host without `/api` is not the API.

Check it without spending your key quota:

```bash
curl -i "https://movable-eastcoast-showman.ngrok-free.dev/api/health" \
  -H "ngrok-skip-browser-warning: true"
```

Expected: `200 {"ok":true}`.

## Headers

| Header                       | When                                | Value                             |
| ---------------------------- | ----------------------------------- | --------------------------------- |
| `X-API-Key`                  | Every request except `/api/health`  | The key issued to you privately   |
| `ngrok-skip-browser-warning` | Every request to the live ngrok URL | `true`                            |
| `Authorization: Bearer …`    | Writes and private reads            | Token from `POST /api/auth/login` |
| `Content-Type`               | `POST` / `PUT` with a JSON body     | `application/json`                |

Never put a key in a browser bundle, screenshot, repository, or chat message.
Keep it on your server.

## First request

```bash
curl -i "https://movable-eastcoast-showman.ngrok-free.dev/api/v2/events" \
  -H "X-API-Key: <your-api-key>" \
  -H "ngrok-skip-browser-warning: true"
```

Expected: `200` with a JSON body beginning `{"events":[...]}`.

Useful reads:

| Method | Path             | Purpose                          |
| ------ | ---------------- | -------------------------------- |
| GET    | `/api/health`    | Liveness check; no key needed    |
| GET    | `/api/clubs`     | List clubs                       |
| GET    | `/api/v2/events` | List events in the current shape |
| GET    | `/api/auth/me`   | Identify the signed-in user      |

There is **no** `GET /api/events/:id` or `GET /api/clubs/:id`. Read the list and
filter by `id`. `PUT` and `DELETE` still use `/api/v2/events/:id`.

## Current events shape

`GET /api/v2/events` returns each event with one ISO 8601 timestamp:

```json
{
  "events": [
    {
      "id": "event-05",
      "title": "River Trail 5K",
      "startTime": "2026-10-12T06:30:00+03:00"
    }
  ]
}
```

The old shape — `date` plus `time` — is still available at `/api/events` and
`/api/v1/events`, but v1 is deprecated and stops working on **30 November 2026**.
See [DEPRECATION_NOTICE.md](DEPRECATION_NOTICE.md) before you build against it.

## Rate limit

Each key may make **100 requests per 60 seconds**. Over the limit you get `429`
with a `Retry-After` header and:

```json
{ "error": "Too many requests.", "retryAfter": 42 }
```

Wait at least `retryAfter` seconds before retrying. Do not retry a `429` in a tight loop.

## What the error means

| Response                                      | What it means                                                          | What to do                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `401 {"error":"Missing or invalid API key."}` | The request reached CampusHub, but the key is missing or wrong         | Check the `X-API-Key` header and ask for a replacement key |
| `404 {"error":"Not found."}`                  | The request reached CampusHub, but the path is wrong                   | Check the path, including `/api` and the version prefix    |
| `404 {"error":"Event not found."}`            | The path is valid, but that event ID does not exist                    | Use an ID from `GET /api/v2/events`                        |
| Plain-text `404 page not found`               | The request did not reach CampusHub; the ngrok tunnel is misconfigured | Tell us — this is our tunnel, not your key or path         |
| HTML warning page                             | The ngrok browser warning intercepted the request                      | Send `ngrok-skip-browser-warning: true`                    |
| `429`                                         | Your key exceeded the rate limit                                       | Honour `Retry-After`                                       |
| `502 {"error":"Partner data unavailable"}`    | An upstream partner feed is down                                       | Retry later; the rest of the API still works               |

A correct key does **not** prevent a 404. Authentication is checked only after a
route matches, so a 404 usually means the URL shape is wrong; a 401 means the key
is wrong.

## Contact

Use the team contact who issued your key. Include the full request URL, the HTTP
status, and the response body — never the key itself.
