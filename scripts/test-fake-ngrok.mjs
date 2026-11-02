#!/usr/bin/env node
// test-fake-ngrok.mjs — a stand-in for both halves the tunnel watchdog polls:
//
//   /api/tunnels  -> ngrok's web UI half. When the fake tunnel is UP it answers
//     {"tunnels":[{"public_url":"https://stub-watchdog.test"}]}, which
//     tunnel_up()'s grep accepts; when DOWN it answers "{}" (no tunnels —
//     exactly the "up but zero tunnels counts as down" shape).
//   /api/health   -> the API's key-exempt health endpoint. UP answers {"ok":true};
//     DOWN answers 503 {"ok":false} so api_up()'s grep rejects it.
//
// State is read from the control file on EVERY request, so the test runner can
// flip a half down (or back up) mid-run by rewriting one small JSON file — no
// restart, no race with the watchdog's next poll.
//
// Driven by scripts/test-watchdog.sh, which sets:
//   STUB_CONTROL_FILE  where {"tunnelsUp":bool,"healthUp":bool} is read from
//   STUB_READY_FILE    where this stub writes "127.0.0.1:<port>" when listening
import http from "node:http";
import fs from "node:fs";

const stubUrl = "https://stub-watchdog.test";
let control = { tunnelsUp: true, healthUp: true };

function readState() {
  try {
    control = JSON.parse(fs.readFileSync(process.env.STUB_CONTROL_FILE, "utf8"));
  } catch {
    // Keep the last good state; the runner always writes complete JSON.
  }
}

const server = http.createServer((req, res) => {
  readState();
  if (req.url.includes("/api/tunnels")) {
    const body = control.tunnelsUp ? JSON.stringify({ tunnels: [{ public_url: stubUrl }] }) : "{}";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  } else if (req.url.includes("/api/health")) {
    if (control.healthUp) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
    } else {
      res.writeHead(503, { "content-type": "application/json" });
      res.end('{"ok":false}');
    }
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  fs.writeFileSync(process.env.STUB_READY_FILE, `127.0.0.1:${port}`);
  console.log(`fake-ngrok stub listening on 127.0.0.1:${port} (tunnel=${stubUrl})`);
});

function exit() {
  process.exit(0);
}
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
