# Week 10 demo rehearsal (3 steps)

**Before:** MySQL (XAMPP) on; `cd server && npm start`; `npm run dev` in the project root; wake the partner first:
`curl.exe -i https://farmers-agroconnect.onrender.com/api/health` (can take ~1 min cold).

1. **Live data.** Open http://localhost:5173, scroll to "Fresh from AgroConnect". Listings appear (e.g. Fresh tomatoes, Grace Wanjiku). Show the Network tab: the browser calls `/api/partner/produce` on OUR server, no partner key or URL in the page.
2. **Partner down.** Set `PARTNER_URL=https://nope.invalid/api` in `server/.env`, restart the server, reload. Panel shows "Partner data is unavailable right now." Rest of the app still works (click a club). Terminal shows `partner call failed: ENOTFOUND`. (If their server is stoppable, use that instead and expect `ECONNREFUSED`/502.)
3. **Partner back.** Restore `PARTNER_URL=https://farmers-agroconnect.onrender.com/api`, restart, reload. Data returns, no code changed.

**Before pushing:** `git status` must NOT list `.env`, and the RAW-response `console.log` must still be commented out. Then:

```
git add . INTEGRATION_LOG.md .env.example
git commit -m "Week 10: live integration with upstream partner"
git push
```
