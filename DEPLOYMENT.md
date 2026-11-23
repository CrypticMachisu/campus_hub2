# Self-hosted deployment

This is the production-shaped deployment path for Kesho. It uses Docker,
MySQL 8.4, nginx and a Node API. There is no paid hosting or email dependency;
the whole stack can run on one machine you control.

Email remains out of scope for this deployment. The app works without it.

## What runs

| Service     | Purpose                                         | Exposed                       |
| ----------- | ----------------------------------------------- | ----------------------------- |
| `web`       | Built React app served by nginx, proxies `/api` | `127.0.0.1:${WEB_PORT:-8080}` |
| `prerender` | Internal crawler HTML gateway                   | internal only                 |
| `api`       | Express API                                     | `127.0.0.1:${API_PORT:-5000}` |
| `db`        | MySQL 8.4 with a persistent volume              | internal only                 |
| `migrate`   | One-shot schema baseline + pending migrations   | no                            |
| `proxy`     | Optional Caddy TLS edge (`--profile tls`)       | public `80`, `443`            |

The browser talks to nginx at `/api`, so the frontend and API share an origin.
Web and API are bound to loopback; the optional TLS profile is the only public
entry point. Without it, use a private network or your own TLS terminator.

## Crawler metadata

`prerender` is a small internal Node service that gives crawlers and social
scrapers route-specific HTML. nginx still serves fonts, images and hashed
assets directly. For document URLs it proxies the fallback to `prerender`,
which reads the built `dist/index.html` and injects `<title>`, description,
canonical, robots, Open Graph/Twitter tags and JSON-LD structured data before
sending it. Club pages emit `Organization`; event pages emit `Event`.

Public club, event, commitment and post pages read their names and copy from
the API. Private routes (`/workspace`, `/dashboard`, `/settings`, `/my-events`,
`/network`) are marked `noindex, nofollow`. If the API is unavailable, the
gateway serves a generic title for that route instead of failing the page.

Set `PUBLIC_URL` to the public origin (`https://kesho.example.com`) so canonical
and social image URLs are absolute and point at the real site. If it is empty,
the gateway derives the origin from the request. Metadata is cached for 60
seconds inside the gateway.

Check the crawler view before sharing a link:

```bash
curl -fsS http://127.0.0.1:8080/clubs/club-01 | grep -E "<title>|og:title|canonical|robots"
```

## Prerequisites

- Docker Engine with Compose v2.
- A host with enough disk for MySQL, backups and the image layers.
- For the bundled TLS profile: a DNS name pointing at the host, and inbound
  TCP 80 and 443 reachable for certificate issuance and renewal.

## First deploy

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` and replace every `change-me` value. Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`API_KEYS` may contain several comma-separated keys. Set `VITE_API_KEY` to one
of them; that is the key baked into the browser build. It is an identifier and
rate-limit bucket, not a secret—user protection still comes from the login JWT.

Build and start:

```bash
docker compose --env-file deploy/.env up -d --build
```

A fresh volume uses `server/campushub_schema.sql`: tables and reference
categories only, with no demo users, clubs or events. The `migrate` service
records the schema and applies any pending migrations.

Create the first tier 1 operator and campus:

```bash
docker compose --env-file deploy/.env run --rm migrate npm run bootstrap:admin
```

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, and
`BOOTSTRAP_CAMPUS_NAME` in `deploy/.env` first. `BOOTSTRAP_ADMIN_NAME`,
`BOOTSTRAP_CAMPUS_SLUG` and `BOOTSTRAP_CAMPUS_DOMAIN` are optional; the domain
defaults to the admin email domain. The command is idempotent and never prints
the password. Keep the bootstrap password out of shell history where possible,
and remove `BOOTSTRAP_ADMIN_PASSWORD` from `deploy/.env` after the account is
created.

> **Do not use the demo bootstrap for real users.** For a disposable pilot
> stack only, set `BOOTSTRAP_SQL=./server/campushub_database.sql` before the
> first boot. That file contains demo accounts and sample content. It also drops
> and recreates the database, so it must never run against live data.

## TLS

The `tls` profile adds Caddy in front of the stack. It obtains and renews a
public certificate automatically and redirects HTTP to HTTPS.

1. Point `SITE_ADDRESS` at the public DNS name.
2. Set `PUBLIC_URL` and `CORS_ORIGINS` to `https://` plus that same name.
3. Make sure inbound TCP 80 and 443 reach the host.
4. Start the edge with the rest of the stack:

```bash
docker compose --env-file deploy/.env --profile tls up -d --build
```

Caddy keeps certificates and account data in the `caddy_data` volume. Do not
delete it. Renewal is automatic; no cron job is required.

For a local test, leave `SITE_ADDRESS=localhost`. Caddy uses its internal CA, so
`curl -k https://localhost/healthz` works but a browser will warn. The CA root
is in the `caddy_data` volume at
`/data/caddy/pki/authorities/local/root.crt` if you want to trust it on a test
machine. This is not a public certificate.

Web and API are bound to `127.0.0.1`; do not publish them directly. If you use
your own reverse proxy instead, terminate TLS there and proxy to
`http://127.0.0.1:${WEB_PORT}` (including `/api`).

## Verify

```bash
curl -fsS http://127.0.0.1:5000/api/health   # process is alive
curl -fsS http://127.0.0.1:5000/api/ready    # database is reachable
curl -fsS http://127.0.0.1:8080/healthz      # nginx is serving
```

With the TLS profile, verify the public path instead:

```bash
curl -fsS https://kesho.example.com/healthz
curl -fsS https://kesho.example.com/api/ready
```

`/api/health` is deliberately cheap and does not touch MySQL. `/api/ready`
returns `503` when the database is down, so use it for container health checks
and uptime monitoring. Every API response carries an `X-Request-Id`; the same
id appears in the JSON request log.

## Logs

```bash
docker compose --env-file deploy/.env logs -f api
docker compose --env-file deploy/.env logs -f web
```

API logs are one JSON object per request: time, request id, method, path,
status, duration and a hashed caller label. Query strings, bodies, API keys and
tokens are not logged.

## Monitoring

Run the external monitor from another machine or the host's cron, not only from
the app container:

```bash
MONITOR_BASE_URL=https://kesho.example.com \
MONITOR_BACKUP_DIR=/var/backups/kesho \
ALERT_WEBHOOK_URL=https://hooks.example.com/kesho-monitor \
npm run monitor
```

It checks the web health endpoint, API readiness (including MySQL), the public
TLS certificate trust and expiry, and the age of the newest local backup. The
certificate check is skipped for HTTP URLs; production should use HTTPS. Set
`MONITOR_CERT_MIN_DAYS` (default 14) and `MONITOR_BACKUP_MAX_AGE_HOURS`
(default 36) to match your renewal and backup schedules.

Example every-15-minute cron entry (keep the webhook in a root-owned env file):

```cron
*/15 * * * * cd /srv/kesho && . /etc/kesho-monitor.env && /usr/bin/node scripts/monitor.mjs >>/var/log/kesho-monitor.log 2>&1
```

A failed check exits non-zero and sends the same `text`/`content` JSON alert as
the backup script. For a local Caddy test, use an HTTP base URL or explicitly
allow the internal certificate with `MONITOR_TLS_ALLOW_SELF_SIGNED=1` and
`NODE_TLS_REJECT_UNAUTHORIZED=0`; never use those settings in production.

## Backups

Take a backup before every deploy and on a schedule:

```bash
bash scripts/backup-db.sh
```

The script uses `mysqldump --single-transaction`, writes to `backups/`, and
keeps 14 days by default. Override the directory or retention:

```bash
BACKUP_DIR=/var/backups/kesho RETENTION_DAYS=30 bash scripts/backup-db.sh
```

### Off-host copy and alerts

A backup on the same disk is not a backup. The script needs `curl` for optional
alerts. Install `rclone`, configure a remote (S3, Backblaze B2, SFTP or another
provider), and set:

```bash
OFFSITE_REMOTE=remote:kesho/backups
OFFSITE_RETENTION_DAYS=30
ALERT_WEBHOOK_URL=https://hooks.example.com/kesho-backup
```

The script copies the new dump to the remote, verifies that it is listed there,
and deletes remote `campushub-*.sql.gz` files older than the retention period.
If any step fails it exits non-zero and sends a JSON failure message to the
webhook. Slack and Discord accept the `text`/`content` fields; a generic
webhook can read either. No credentials are included in the alert.

Run a manual backup with the same environment before relying on cron:

```bash
OFFSITE_REMOTE=remote:kesho/backups \
ALERT_WEBHOOK_URL=https://hooks.example.com/kesho-backup \
bash scripts/backup-db.sh
```

Example daily cron entry (put the variables in a root-owned env file rather
than exposing secrets in the crontab):

```cron
15 2 * * * cd /srv/kesho && . /etc/kesho-backup.env && BACKUP_DIR=/var/backups/kesho /usr/bin/bash scripts/backup-db.sh >>/var/log/kesho-backup.log 2>&1
```

### Restore drill

A restore is destructive and requires an explicit confirmation:

```bash
CONFIRM_RESTORE=yes bash scripts/restore-db.sh backups/campushub-20261122T020000Z.sql.gz
```

After restoring:

1. `curl -fsS http://127.0.0.1:5000/api/ready`
2. Run a real smoke check against the recovered stack.
3. Confirm the restored row counts and the newest post/event.

Practice this on a throwaway stack before relying on it.

## Upgrade

```bash
bash scripts/backup-db.sh
git pull
# Without TLS:
docker compose --env-file deploy/.env up -d --build
# With the bundled TLS edge:
docker compose --env-file deploy/.env --profile tls up -d --build
```

The `migrate` service runs before the API restarts. Migrations are forward-only;
there is no automatic rollback. To revert code, check out the previous commit
and rebuild, then restore the pre-deploy backup if the schema changed.

## Security posture

- The TLS profile terminates HTTPS at Caddy, adds HSTS, and is the only
  service bound to a public interface. Caddy's admin API is disabled.
- `helmet` sets standard API response headers; nginx adds browser headers.
- CORS is restricted by `CORS_ORIGINS`; the bundled web container uses the same
  origin and does not need a wildcard.
- `TRUST_PROXY=1` is set for the bundled nginx so rate limiting sees real client
  IPs. Do not set it when Express is directly exposed.
- MySQL is not published to the host. The application connects as a non-root
  user.
- The API key in the browser bundle is public by design. Keep the partner key
  and the database passwords out of the frontend.

## Known limits

- **Single API instance.** Rate limits and monitoring totals are in process
  memory. Running several API replicas would give each its own bucket; move the
  limiter to a shared store before scaling horizontally.
- **Single MySQL instance.** There is no managed failover. Backups are the
  recovery path.
- **Off-host backup needs rclone.** The local dump still works without it, but
  true disaster recovery requires a configured remote and tested restore.
- **TLS needs public DNS and ports 80/443.** Caddy obtains certificates
  automatically, but it cannot issue one for a name that does not point at the
  host. For a private deployment, use your own trusted certificate terminator.
- **No email.** Password-reset and reminder email integration is intentionally
  excluded from this deployment.

## Troubleshooting

```bash
docker compose --env-file deploy/.env ps
docker compose --env-file deploy/.env logs migrate
docker compose --env-file deploy/.env --profile tls logs proxy
docker compose --env-file deploy/.env exec db \
  mysqladmin ping -h 127.0.0.1 -u root -p"$MYSQL_ROOT_PASSWORD"
```

If Caddy cannot issue a certificate, check that DNS points at this host and
that ports 80/443 are reachable. For a local-only test, `SITE_ADDRESS=localhost`
uses the internal CA and produces a browser warning by design.

If `migrate` exits non-zero, fix the schema problem before restarting the API.
The API depends on `migrate` completing successfully, so a failed migration
will leave the old API container running rather than serving a half-migrated
schema.
