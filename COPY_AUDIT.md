# Kesho copy audit

**Date:** 22 November 2026  
**Scope:** User-facing copy across the web app: navigation, page content, forms, buttons, empty/error/loading states, confirmations, notifications, accessibility labels, document metadata, and seeded demo content.  
**Companion:** `AUDIT.md` covers visual and functional presentation readiness. This file covers voice, terminology, clarity, trust, and content accuracy.

## Implementation status (23 November 2026)

The P0 trust issues **C01–C04 are fixed in the working tree**, along with selected high-impact copy changes:

- Removed the demo credentials and User/Admin path chooser; login now routes by the account's actual role.
- Replaced the unusable reset-email form with an honest support path.
- Aligned network copy around one rule: events, commitments and posts travel; club membership, rosters and discussions stay local.
- Replaced developer-facing API/storage errors with user-facing connectivity copy.
- Removed member/admin-facing `Tier 1`/`Tier 2` labels, fixed the `My events` quick action, removed hardcoded campus/city/edition claims, corrected the Home commitments count and spots label, renamed the agenda tab to `My RSVPs`, and fixed the club profile's `Meeting Interval` / `Location Spot` labels.
- Added route-specific page titles, descriptions, and social preview metadata.
- Added a prerender gateway behind nginx so crawlers and social scrapers receive route-specific head tags for club, event, commitment and post URLs; private routes are `noindex`.
- Added `Organization` and `Event` JSON-LD structured data for club and event pages.
- Replaced the external `placehold.co` image with a local Kesho event fallback.
- Standardized event actions on **RSVP / Cancel RSVP / Join waitlist**, commitment actions on **Commit / Withdraw**, and separated **posts** from member-only **announcements**.
- Replaced admin-facing API internals (`tier 1`, `clubId`, `startsAt`, `mediaIds`, raw status enums) with platform/club roles and plain instructions.
- Added focused tests for both event-image fallback paths, client route metadata, and crawler metadata injection on club, event and commitment pages.

The findings below remain as the original audit record. Items not listed above are still open.

---

## Verdict

The editorial voice is the app's strongest product asset. Lines like **“This week.”**, **“Pick something, and it becomes a commitment rather than a bookmark,”** and **“Show up tomorrow. Built by students, for students.”** give Kesho a point of view that most campus apps do not have.

The problem is not the voice. It is that the voice disappears at exactly the moments users need clarity most: signing in, recovering a password, understanding who can see what, joining a club, managing commitments, and interpreting an error. In those places, the copy switches into engineering language (**“API,” “object storage,” “startsAt,” “tier 1,” “approved affiliations,” “campus-gated”**) or into labels borrowed from the database (**“Meeting Interval,” “Location Spot,” “Campus id”**).

The result is a product that reads like a considered student publication on the surface and like an internal admin console underneath. That gap is the central copy problem to fix.

### Copy scorecard

| Dimension                      |      Score | Assessment                                                                                                                                                |
| ------------------------------ | ---------: | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voice and tone                 |       8/10 | Distinctive, warm, specific, and free of generic SaaS language on the discovery and club surfaces.                                                        |
| Clarity                        |       6/10 | Most primary journeys are understandable, but several network, admin, and recovery paths require product knowledge.                                       |
| Consistency                    |       4/10 | One action has many names; one content object has several names; role and admin terminology changes by page.                                              |
| Trust and production readiness |       3/10 | Demo credentials, console-based password recovery, developer error copy, seed-data labels, and contradictory visibility claims are visible to real users. |
| Accessibility copy             |       7/10 | Strong alt-text workflow and skip links; some errors are not announced, and a few labels describe actions inaccurately.                                   |
| Localization and content       |       4/10 | Hardcoded city/campus defaults, mixed US/Kenyan terminology, and 12-hour/24-hour time formats.                                                            |
| **Overall**                    | **5.5/10** | Strong writing, weak copy system. Fix the terminology and trust issues before adding more surfaces.                                                       |

---

## What is already working

These should be protected during any rewrite:

1. **The editorial framing is coherent.** “This week,” “edition,” “dispatch,” and “stop press” feel like one publication, not four unrelated metaphors.
2. **The discovery deck is excellent.** “What is happening on campus, edited down to what you can actually show up for” explains the product in one sentence.
3. **The commitment promise is clear.** “Join one and it appears in your commitments, with a waitlist position if the seats are gone” sets an honest expectation.
4. **The photo-description workflow is unusually good.** “This is what screen readers announce for the photo. Say what it shows, not what it is” is better than most production apps.
5. **The report dialog makes a clear privacy promise.** “A club manager will review it. Your name is not shown to them” is direct and reassuring.
6. **The session-expiry copy respects the user's work.** “Sign in again to keep this draft” and “everything you were writing will stay exactly where it is” are the right ideas.
7. **Destructive actions generally explain consequences.** Post removal copy mentions closing the public thread and its reports; event deletion says it cannot be undone.
8. **There are no exclamation marks in the UI.** The restraint suits the brand.
9. **Empty states are often human.** “No comments yet — be the first to say something” and “Nothing committed yet” are warm without being cute.
10. **The skip links and breadcrumb labels exist.** The accessibility foundation is better than average.

---

## Top 12 findings

1. **Production login exposes demo accounts and asks users to choose an internal role path.** This is both a trust problem and a security problem.
2. **Password recovery tells users to ask a server operator to read the console.** That is a development workflow presented as a customer journey.
3. **The network boundary copy contradicts the network page.** The page displays network posts and commitments while its boundary note says only events travel and posts/commitments stay local.
4. **When the API is down, the app tells users to check whether the API is running.** That is developer copy in a production error state.
5. **Internal role names are visible to members.** “Tier 1,” “tier 2,” and “admin access” appear on campus access, club, workspace, family, and login surfaces.
6. **“My events” and “My commitments” are the same destination with different names.** A member can reasonably think these are two different lists.
7. **One action has at least six names.** RSVP, join, commit, sign up, save your spot, and “I'm going” all appear for overlapping actions.
8. **One content object has at least six names.** Post, update, dispatch, notice, announcement, and “network notice” are used for related or identical things.
9. **The public shell makes hardcoded claims.** “Nairobi,” “Strathmore University,” “Vol. 01,” and “Campus live” are presented as live facts regardless of deployment, campus, or connection state.
10. **Some displayed counts and states are false.** “Your commitments” is capped at three but displays the capped count; the “Going” tab includes waitlisted people; an event's “Going” fact actually shows spots taken.
11. **The admin desk exposes seed data and placeholder assets.** “Seed event · read-only” and a `placehold.co/600x300` fallback are visible in the product.
12. **The interface has one document title and no page metadata.** Every route is “Kesho — This week at campus,” which is also grammatically off (“on campus” is the natural phrase).

---

## P0 — fix before showing the app to real users

### C01. Demo credentials and role-path selection on the public login

**Where:** `src/pages/Login.jsx:8-24`, `:158-210`, `:246`

The login page displays **“Admin demo”** and **“User demo”** buttons, names the seeded accounts, and fills the seeded password. It also asks every visitor to choose **“User”** or **“Admin”** and explains the choice with:

> “Admin path — your account needs tier1, campus admin or tier2 club admin rights (e.g. you were recently promoted). Successful logins land on the Dashboard.”

**Why it matters:** This exposes the demo model and a shared password on the production login, and it teaches users an internal permission taxonomy before they have an account. It also encourages normal members to choose “Admin” to see what happens.

**Recommended:**

- Remove the demo picker and prefilled credentials from any non-demo build. Gate them behind an explicit `VITE_DEMO_MODE=true` flag, never just `NODE_ENV !== "production"`.
- Remove the User/Admin path selector from the public login. Authenticate the account, then route by role: members to the edition/workspace, admins to the desk when they choose it from navigation.
- If an admin-specific entry point is genuinely needed, label it **“Staff sign in”** on a separate route, not as a choice every user must make.
- If the selector stays for a demo, replace the explanatory paragraph with one line: **“Use your staff account to open the club desk.”** Do not expose “tier1/tier2.”

### C02. Password reset exposes the missing email integration

**Where:** `src/pages/ForgotPassword.jsx:21-27`

> “Enter your email below and we'll send you a link to reset your password.”
>
> “If an account exists for that email, a reset link has been generated. No email service is wired up yet — ask whoever's running the server to check its console output for the link.”

**Why it matters:** The first sentence promises an email the product cannot send. The success message then turns a student into a server operator. This is honest engineering status, not a user journey, and it undermines confidence in account security.

**Recommended:**

- Until email is configured, do not expose this as a self-service flow. Replace both states with: **“Password reset isn't available yet. Contact your campus administrator for help.”**
- Once email is configured, use: **“If an account exists for that email, we've sent a reset link. Check your inbox and spam folder.”**
- Keep the neutral “if an account exists” wording to avoid account enumeration.
- The email provider is an external dependency; the copy must not reveal that fact to users.

### C03. Network visibility copy directly contradicts the page

**Where:** `src/pages/Network.jsx:274-378`, `:473-475`; `src/pages/ClubProfile.jsx:176-180`, `:205-209`

Network page renders **“Network notices”** (posts) and **“Network commitments”**, then says:

> “Only events deliberately marked ‘My club network’ travel here; posts, commitments and membership remain on the host campus.”

The remote club profile says:

> “Network-published events and commitments appear in My network. Posts and membership stay on [campus].”

**Why it matters:** This is a privacy and data-visibility claim. A member may decide what to publish based on it. It is also visibly false on the same screen: network posts and commitments are displayed above the note.

**Recommended:** Pick the real model and state it once:

- **“Shared with your network: club identity, network events, network commitments, and network posts. Local membership, campus-only activity, and discussions stay on the host campus.”**
- Use the same sentence pattern on Network, ClubProfile, FamilyProfile, EventDetail, CommitmentDetail, and PostDetail.
- If the product truly intends posts and commitments to stay local, remove them from Network and fix the queries; do not fix the copy to match a UI that contradicts it.

### C04. Developer error copy is shown to users

**Where:** `src/utils/api.js:87-90`; `src/utils/postsStore.js:49-52`

> “Can't reach the server. Check that the API is running.”  
> “The server didn't respond in time. Try again.”  
> “The photo upload couldn't reach storage. Check your connection.”  
> “Storage rejected the photo upload. Try again.”

**Why it matters:** “API” and “storage” are implementation details. On a phone, a student cannot check whether the API is running. The message also implies the user is responsible for infrastructure.

**Recommended:**

- Network failure: **“We can't connect right now. Check your connection and try again.”**
- Timeout: **“That took too long. Try again.”**
- Upload failure: **“The photo didn't upload. Check your connection and try again.”**
- Unknown server error: **“Something went wrong on our side. Try again in a moment.”**
- Never interpolate `Request failed (500)` into primary copy. Keep the status code in logs, not in the interface.

---

## P1 — fix before calling the copy production-ready

### C05. Internal role taxonomy leaks into member-facing copy

**Where:**

- `src/pages/CampusAccess.jsx:181`, `:203`, `:362`
- `src/pages/ClubProfile.jsx:327`
- `src/pages/ClubWorkspace.jsx:690-694`, `:725`
- `src/pages/FamilySettings.jsx:165`, `:180-181`
- `src/pages/Network.jsx:196`
- `src/components/Navbar.jsx:17-20`
- `src/pages/Dashboard.jsx:1467-1594`
- `server/routes/clubFamilies.js:459`

Examples:

> “A campus admin or tier 1 admin decides the request; it is not granted automatically.”  
> “This is your own request. Another campus admin or tier 1 must decide it.”  
> “Leaving keeps your admin role. Ask a tier 1 admin to revoke that.”  
> “Tier 1 already has the campus edition switcher.”

**Why it matters:** “Tier 1” is an implementation hierarchy, not a role a student understands. It makes the product sound like a database exercise and creates unnecessary power distance.

**Recommended:**

- Member-facing roles: **Platform admin**, **Campus admin**, **Club admin**, **Member**.
- Replace “tier 1” with **“platform admin”** in every user-facing string.
- Replace “tier 2” with **“club admin”**.
- Keep `tier1`/`tier2` only in code, API payloads, audit logs, and internal documentation.
- In role labels, prefer the scope: **“Platform admin”** not **“Tier 1.”**
- Where the role does not matter, say **“a campus admin”** or **“your club admin.”**

### C06. “My events” and “My commitments” are the same page

**Where:** `src/pages/ClubWorkspace.jsx:515`; `src/components/Navbar.jsx:118`; `src/components/MemberShell.jsx:136`; `src/pages/MyEvents.jsx:168-169`; route `/my-events` in `src/App.jsx:83`, `:139`

The navigation says **“Commitments”** or **“My commitments.”** The workspace quick action says **“My events”** but links to `/my-events`, whose heading is **“My commitments.”**

**Why it matters:** Users cannot tell whether “My events” is a filtered subset, an older label, or a different list. The quick action is one of the most likely first clicks in the workspace.

**Recommended:**

- Use **“My commitments”** everywhere in the UI. Keep the route path for compatibility if needed.
- If the team wants a shorter mobile label, use **“Commitments.”**
- Add a one-line explanation on the page: **“Events you've RSVP'd to and activities you've joined, in one list.”**
- Give each item a visible type label: **Event** or **Commitment/Activity**.

### C07. The same action is called RSVP, join, commit, sign up, and “save your spot”

**Where:** `src/pages/EventDetail.jsx:179-182`, `:273-284`, `:315`; `src/pages/CommitmentDetail.jsx:327`, `:333`; `src/components/CommitmentsSection.jsx:407-414`; `src/components/ClubAgenda.jsx:124-127`; `src/pages/Login.jsx:252`; `src/components/AgriClubSpotlight.jsx:27-32`

Current examples:

| Surface           | Current action                                       |
| ----------------- | ---------------------------------------------------- |
| Event detail      | “I'm going” / “Save your spot” / “Join the waitlist” |
| Commitment detail | “Commit to this” / “Join the waitlist”               |
| Commitment list   | “Join” / “You're going” / “On the waitlist”          |
| Workspace agenda  | “RSVP”                                               |
| Signup copy       | “RSVP to events”                                     |
| Agri spotlight    | “sign up”                                            |
| Login             | “Sign up” for account creation                       |

**Why it matters:** “Sign up” means both “create an account” and “reserve a place.” “Join” means both “join a club” and “join an activity.” “Commit” is the product's core idea, but it is used inconsistently. The result is ambiguity at the exact moment the product asks for a commitment.

**Recommended model:**

| Object              | Primary action     | Joined state         | Waitlist                               |
| ------------------- | ------------------ | -------------------- | -------------------------------------- |
| Event               | **RSVP**           | **You're going**     | **Join waitlist** / **Leave waitlist** |
| Commitment/activity | **Commit**         | **You're committed** | **Join waitlist** / **Leave waitlist** |
| Club                | **Join club**      | **Member**           | Not applicable                         |
| Account             | **Create account** | Signed in            | Not applicable                         |

- Never use “sign up” for an event or commitment.
- Never use “join” alone for a commitment; use **“Commit”** or **“Join waitlist.”**
- Use **“View details”** instead of **“Read the notice”** for event/commitment links.
- Use **“Saved”** only if the product actually supports bookmarks; the deck explicitly contrasts commitments with bookmarks, so avoid reintroducing bookmark language.

### C08. Post, update, dispatch, notice, announcement, and notification are overloaded

**Where:**

- `src/components/ClubFeed.jsx:367-384`, `:438-453`
- `src/pages/ClubWorkspace.jsx:570-586`
- `src/pages/Dashboard.jsx:538-568`
- `src/pages/Network.jsx:274-297`
- `src/pages/MyEvents.jsx:199-201`
- `src/pages/PostDetail.jsx:81-125`

Current usage:

- **Post:** a public club update with comments.
- **Update:** the same post, in buttons and empty states.
- **Dispatch:** the editorial label for a post.
- **Notice:** an event/commitment detail, a network post, and a system notification.
- **Announcement:** a separate dashboard object shown in the member workspace feed.
- **Notification:** a system update shown under “Notices” in My commitments.

**Why it matters:** Members cannot build a mental model of what is public, what is member-only, and what is a system alert.

**Recommended content model:**

| Object                  | UI name                       | Audience          | Where it appears               |
| ----------------------- | ----------------------------- | ----------------- | ------------------------------ |
| Post                    | **Post** (kicker: “Dispatch”) | Public or network | Club page, PostDetail, network |
| Announcement            | **Announcement**              | Club members      | Workspace feed, club desk      |
| System update           | **Notification**              | Individual member | My commitments → Notifications |
| Event/commitment detail | **Event** / **Commitment**    | Per object        | Detail pages                   |

- Use **“Dispatch”** only as an editorial kicker, not as the object name in buttons or empty states.
- Rename My commitments → **“Notifications”** or **“Updates”**, not “Notices.”
- In the dashboard, make the audience explicit: **“Announcement to club members”** and **“Post to the public club page.”**
- Do not call a post a “notice” in one place and a “post” in another.
- If announcements and posts are intentionally separate, explain the difference once in the dashboard: **“Announcements stay inside the member workspace. Posts appear on the public club page.”**

### C09. Hardcoded campus, city, edition, and “live” claims

**Where:** `index.html:7`; `src/components/Navbar.jsx:92-95`; `src/pages/Home.jsx:236-253`; `src/pages/Dashboard.jsx:377`

Examples:

> `<title>Kesho — This week at campus</title>`  
> “Vol. 01 · Strathmore University”  
> “Nairobi · [campus] · [date] · Standalone edition”  
> “Main campus” as the unauthenticated fallback  
> “Campus live” with a permanently rendered live dot

**Why it matters:** A product that supports multiple campuses cannot claim one campus for every visitor. “Standalone edition” is deployment vocabulary. “Campus live” is false when the API is down, when the page is static, or when nothing is live.

**Recommended:**

- `<title>Kesho — This week on campus</title>` (or a route-specific title).
- Use the actual campus name when known; for visitors, use **“All campuses”** or omit the campus, not **“Strathmore University”** or **“Main campus.”**
- Replace “Nairobi · … · Standalone edition” with **“Campus edition · [date]”** or the actual city only when it is configured.
- Remove “Vol. 01” unless the edition number is real and changes. If it is a design motif, keep it in the masthead only and make it not look like a data claim.
- Either make “Campus live” a real status (recent activity, API connected) or remove the dot and call it **“Campus edition.”**
- “This week” should reflect a real seven-day window; if it means the next seven days, say **“Next 7 days.”**

### C10. Counts and states that do not match the data

**Where:** `src/pages/Home.jsx:230`, `:360`, `:593`, `:619-622`; `src/components/ClubAgenda.jsx:26-47`; `src/pages/ClubWorkspace.jsx:661-673`

Issues:

1. **Home “Your commitments” uses a truncated array.** The rail builds up to three items with `.slice(0, 3)`, then displays `commitments.length` as the count. A member with eight commitments sees “3.”
2. **Home “Going” fact shows `signupCount/capacity` and labels it “spots taken.”** “Going” implies attendees, but the number can include waitlisted people.
3. **Home “On campus” says “this week” but computes a rolling seven-day window.** The label is false on a Sunday/Monday boundary.
4. **ClubAgenda’s “Going” tab includes waitlisted signups.** The tab says “Going,” but `going` is every upcoming event with a signup, including people who are waitlisted.
5. **Workspace roster says “The roster isn't available right now” when the member list is simply empty.** It treats a legitimate empty state as an outage.

**Recommended:**

- Do not truncate the count. Either render all commitments or show **“3 of 8”** and a **“View all”** link.
- Rename the lead fact to **“Spots taken”** or **“Places taken.”**
- Rename the rail to **“Next 7 days.”**
- Rename the agenda tab to **“My RSVPs”** or split **“Going”** and **“Waitlisted.”**
- Distinguish empty from unavailable: **“No members have joined yet”** vs **“The member list couldn't load. Try again.”**

### C11. Seed data and placeholder assets leak into the product

**Where:** `src/pages/Dashboard.jsx:41`, `:377`, `:498-499`

> “Seed event · read-only”  
> `https://placehold.co/600x300` as the fallback event image

**Why it matters:** “Seed” is developer vocabulary. A placeholder image that displays “600x300” makes the product look unfinished. Both are visible in the club desk, which is the surface most likely to be shown to staff or evaluators.

**Recommended:**

- Replace “Seed event · read-only” with **“Example event · read-only”** (and only in demo mode), or hide seed rows from production entirely.
- Replace the external placeholder with a local branded fallback image or a designed empty image state. Do not expose image dimensions as text.
- In production, remove demo seed rows or mark them in the database as demo-only and filter them out.
- The same principle applies to “Admin demo” and “User demo” on login.

### C12. Login copy is written like a form instruction, not a welcome

**Where:** `src/pages/Login.jsx:135-158`, `:239`, `:252`, `:282`, `:287`

> “Input your email and the correct password.”  
> “Log In” / “Sign Up” tabs alongside “Log in” / “Sign up” heading  
> “(at least 8 characters)” styled as optional  
> “Use your campus email — the domain decides which campus you join.”

**Why it matters:** “Input” is stilted. The heading and tabs disagree on title case. The password rule is presented as optional metadata even though it is a requirement. The campus-domain rule is useful but should be framed as a benefit, not a constraint.

**Recommended:**

- **“Enter your email and password.”** or simply **“Welcome back.”**
- Use sentence case consistently: **“Log in”**, **“Sign up”**, **“Create account.”**
- Put the requirement in the label or helper text, not in a visually optional span: **“Password (8 characters minimum).”**
- Signup helper: **“Use your campus email so we can connect you to the right campus.”**
- For the role selector, if it survives: **“I'm signing in as” → “Student or member / Club or campus staff.”**

### C13. Database-style labels on the club profile

**Where:** `src/pages/ClubProfile.jsx:159-163`

> “Meeting Interval: Tuesdays, 6:00 PM”  
> “Location Spot: Humanities Hall, Room 214”

**Why it matters:** “Interval” and “Spot” are schema names, not human labels. They make the profile feel generated.

**Recommended:**

- **“Meets”** → `Tuesdays, 6:00 PM`
- **“Where”** → `Humanities Hall, Room 214`
- If the value is irregular, use **“Meeting pattern”** rather than “Interval.”
- Use the same labels in the dashboard form: **“Meeting time”** and **“Meeting location”** (already used there).

### C14. Network copy is abstract and contradictory

**Where:** `src/pages/Network.jsx:178-245`, `:473-475`; `src/pages/CampusAccess.jsx:202-267`; `src/pages/FamilyProfile.jsx:142`, `:204-205`; `src/pages/ClubProfile.jsx:178`, `:207`

Examples:

> “Network discovery is built from approved campus affiliations.”  
> “You are currently scoped to [campus].”  
> “This directory follows your approved affiliations.”  
> “The full club page is campus-gated. Sign in to [campus] to open its local activity.”  
> “Only events deliberately marked ‘My club network’ travel here.”

**Why it matters:** “Affiliation,” “scoped,” and “campus-gated” are access-control terms. They explain the implementation, not the user's benefit. The last sentence is also factually wrong for posts and commitments (see C03).

**Recommended:**

- **“Your network is the other campuses you've been approved to access.”**
- **“You're seeing [campus]. Request another campus to see its clubs here.”**
- **“This club is on [campus]. Its local page is available to members of that campus.”**
- **“Shared with your network”** for the content type.
- Keep the boundary explanation short: **“Membership and discussions stay with the campus chapter. Events and posts marked for the network appear here.”**

### C15. Destructive action labels are ambiguous

**Where:** `src/pages/Dashboard.jsx:1218-1248`; `src/components/CommitmentsSection.jsx:407-414`, `:431-453`; `src/components/Tier1ReportQueue.jsx:38-40`

Examples:

- The commitments table's **“Cancel”** button deletes the commitment and its signups.
- The confirmation says **“Cancel this notice”**, while the public page calls the same object a **“commitment.”**
- The joined commitment button says **“On the waitlist”** but its action is to withdraw.
- Cancelling an RSVP shows **“Saving…”** rather than **“Cancelling…”** (`src/pages/MyEvents.jsx:370`).
- **“Yes” / “No”** are used as the only confirmation choices in several places.

**Why it matters:** A status label used as a button is a usability trap. “Cancel” can mean “cancel this edit” or “delete this commitment.” “Media” is not a user-facing noun.

**Recommended:**

- **“Delete commitment”** or **“Cancel commitment”** with the consequence in the confirmation.
- Confirmation: **“Cancel this commitment? It will be removed for everyone and its 12 signups will be released.”**
- Buttons: **“Cancel commitment”** and **“Keep commitment.”**
- Joined state: **“On the waitlist”** as text; action button: **“Leave waitlist.”**
- Photo confirmation: **“Remove this photo and close its 2 reports?”**
- Use the concrete object name in every confirmation. Do not collapse “post,” “photo,” and “commitment” into “media” or “item.”

### C16. Announcements vs posts are not distinguishable

**Where:** `src/pages/Dashboard.jsx:538-568`; `src/components/ClubFeed.jsx:384-421`; `src/pages/ClubWorkspace.jsx:570-586`

The dashboard has separate **“Announcements”** and **“Posts”** sections. The public club page shows posts. The member workspace shows a **“Club feed”** made of announcements and comments, not posts. None of the labels explain the audience difference.

**Why it matters:** A club admin can easily publish to the wrong audience. A member cannot tell why an announcement is not on the public page or why a post is missing from the workspace feed.

**Recommended:**

- In the dashboard, label the two sections by audience:
  - **“Announcements to members”** — “Shown in the club workspace. Not on the public page.”
  - **“Posts on the club page”** — “Public to the campus (or your club network).”
- Rename the workspace section **“Latest from the club”** and include a small source label: **Announcement** or **Discussion**.
- If announcements are deprecated, remove them rather than keeping two overlapping publishing tools.

### C17. Empty states and empty-state grammar break under real filters

**Where:** `src/pages/Home.jsx:501-505`, `:541-544`, `:583-584`, `:610`; `src/pages/Network.jsx:438-444`

Examples:

- Feed count: **“12 on”** for events.
- Search empty: **“Nothing matches “” in Academic.”** when the search field is blank and only a category filter is active.
- Rail: **“The full list is under Events”** when “Events” is a toggle in the same view, not a separate page or heading.
- Network: two different empty messages (**“No network clubs match those filters”** and **“No clubs match those filters”**) appear for the same condition.

**Recommended:**

- Count: **“12 events”** or **“12 clubs.”**
- Empty search:
  - With a query: **“No clubs match “debate.” Try a broader search.”**
  - Without a query: **“No clubs in this category yet.”**
- Rail: **“No events in the next seven days. Switch to Events to see everything.”**
- Use one empty message per condition, with one next action.

### C18. Admin-facing copy is written to other engineers

**Where:** `src/pages/Dashboard.jsx:937-938`, `:1513-1594`; `src/pages/FamilySettings.jsx:176-181`, `:585`, `:659`; `src/pages/CampusSettings.jsx:119-187`

Examples:

> “Lowering a capacity moves the newest signups to the waitlist instead of deleting them, and cancelling a commitment removes its signups after an explicit confirmation.”  
> “A campus admin manages every club on their campus. Tier 1 remains the only platform-wide role.”  
> “The move is audited with both family names.”  
> “Upload needs object storage; the URL field stays available as a fallback.”

**Why it matters:** These are accurate but read like implementation notes. They bury the decision the admin is about to make. The “object storage” sentence is a deployment detail, not a product concept.

**Recommended:**

- Lead with the consequence: **“Lowering the cap moves the newest signups to the waitlist; nobody is deleted.”**
- Replace “Tier 1 remains…” with **“Platform admins can manage every campus.”**
- Replace audit language with **“Recorded in the family history.”**
- For upload: **“Upload a square image, or paste an image URL.”** If upload is unavailable, omit the option rather than explaining the infrastructure.

---

## P2 — consistency, clarity, and polish

### C19. Error-state titles use four different patterns

**Where:** `src/App.jsx:171`; `src/components/ErrorBoundary.jsx:44-47`; `src/components/ErrorState.jsx:9`; throughout pages

Current patterns:

- “The edition didn't load”
- “Clubs didn't load”
- “This club didn't load”
- “The club dispatch didn't render”
- “The posts desk didn't render”
- “Kesho couldn't open this view”
- “Can't load this right now”
- “Something broke in this section. The rest of the page is still here.”

**Why it matters:** “Didn't load,” “couldn't open,” “didn't render,” and “broke” describe the same failure in four voices. “Render” and “broke” are implementation language.

**Recommended standard:**

- Title: **“Couldn't load [thing]”** or **“[Thing] didn't load”**, used identically everywhere.
- Body: **“Try again. If it keeps happening, refresh the page.”**
- Only include “your account is still signed in” when that is specifically useful.
- Avoid “render,” “broke,” and “unexpected error” in user copy.

### C20. Small copy tics that make the app feel less edited

| Where                  | Current                                                      | Recommended                                                                   |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `ClubProfile.jsx:103`  | “Club Not Found”                                             | “Club not found.”                                                             |
| `EventDetail.jsx:203`  | “Event not found”                                            | “Event not found.”                                                            |
| `FamilyProfile.jsx:55` | “Family not found”                                           | “Family not found.”                                                           |
| `MyEvents.jsx:177`     | “Go to login”                                                | “Log in”                                                                      |
| `MyEvents.jsx:209`     | “Mark all read”                                              | “Mark all as read”                                                            |
| `ClubAgenda.jsx:109`   | “Tap RSVP”                                                   | “Choose RSVP” or “RSVP”                                                       |
| `Dashboard.jsx:1513`   | “Admin Management”                                           | “Admin management”                                                            |
| `Dashboard.jsx:1585`   | “Promote to Tier 2 Admin”                                    | “Make club admin”                                                             |
| `Login.jsx:143-151`    | “Log In” / “Sign Up”                                         | “Log in” / “Sign up”                                                          |
| `ClubProfile.jsx:310`  | “Joining swaps this discovery feed for your club workspace.” | “Join this club to see its events and updates in your workspace.”             |
| `ClubFeed.jsx:305`     | “restore it from the desk”                                   | “restore it from the club desk”                                               |
| `PostDetail.jsx:138`   | “Restore it from the club desk”                              | Map by status; see C28                                                        |
| `Dashboard.jsx:222`    | “Capacity must be a whole number…”                           | “Capacity must be a whole number of at least 1. Leave it blank for no limit.” |
| `Home.jsx:611`         | “The full list is under Events.”                             | “Switch to Events to see everything.”                                         |

### C21. Time, date, and locale formats are mixed

**Where:** `src/components/Navbar.jsx:31`; `src/pages/Home.jsx:42-50`; `src/pages/Dashboard.jsx:1877`; `src/pages/MyEvents.jsx:234`; `src/utils/dateTime.js:48-64`

Current examples:

- Events use 24-hour time (`18:00`).
- Club meeting placeholders use 12-hour time (`Tuesdays, 6:00 PM`).
- Some dates use `en-GB` explicitly; others use the browser locale (`undefined`).
- Notification timestamps use `toLocaleString()` with full date and time.
- Event cards omit the year; notifications include it.

**Why it matters:** A user in Nairobi sees several date grammars in one session. The app is set in Kenya but not consistently localized.

**Recommended:**

- Pick one display convention and document it. For a Kenyan campus product, `en-GB` with 24-hour time is a coherent editorial choice: **“Tue 24 Nov · 18:00.”**
- Use the same `formatEventDate` / `formatDateTime` helpers everywhere, including notifications and admin tables.
- If 12-hour time is preferred for club meeting patterns, use it everywhere, not only in placeholders.
- Add a time-zone label once, not in a conditional tied to whether `location` exists. The current “Campus time” only appears when a location is present, which is unrelated.

### C22. British and American English are mixed

**Where:** `src/pages/ClubProfile.jsx:204` (“programme”); `server/campushub_database.sql:675` (“program”); `src/pages/CampusAccess.jsx:17` (“Dual programme”); seeded content (“middle schoolers,” “state qualifiers”)

**Why it matters:** The product is Kenya-facing and mostly uses British spelling (“programme,” “cancelled”). The seed content uses US school idioms. This reads as imported demo data.

**Recommended:**

- Choose British/Kenyan English: **programme, cancelled, organisation, centre, enrolment.**
- Replace “middle schoolers” with **“local school pupils”** or **“secondary school students.”**
- Replace “state qualifiers” with **“regional qualifiers”** or **“county qualifiers.”**
- Replace “fall hackathon” with **“semester hackathon”** or a month-specific name.
- Keep “spikes optional” only if the audience is runners; otherwise say **“running shoes optional.”**

### C23. Accessibility copy gaps

**Where:** `src/pages/Login.jsx:243`, `:298`; `src/pages/ResetPassword.jsx:70`; `src/components/CommentSection.jsx:292`; `src/components/MemberShell.jsx:177-179`; `src/components/ThemeToggle.jsx:10-26`

Issues:

1. Login, signup, reset-password, and comment errors are plain `<p>` elements without `role="alert"` or `aria-live`, so screen-reader users may not hear them.
2. The collapsed sidebar's expand button has `aria-controls="member-sidebar"` even though the sidebar element is unmounted when collapsed.
3. The theme toggle's visible label is the action (“Light” when dark), while `aria-pressed` reflects the current dark state. A screen reader hears the contradictory phrase **“Switch to light mode, pressed”**; the state and action need to be separated.
4. Some “icon-only” controls rely on `title` plus visually hidden text; that is acceptable, but the pattern should be consistent.
5. Event-card and club-card images use empty `alt` text. That is usually correct because the adjacent title names the object, but the lead image on Home carries editorial meaning and should either have descriptive alt text or be explicitly marked decorative.
6. The report dialog's privacy sentence is good, but the dialog would benefit from `aria-describedby` pointing at it so the promise is announced with the heading.

**Recommended:**

- Add `role="alert"` to inline form errors.
- When the sidebar is collapsed, remove `aria-controls` or keep a persistent container element in the DOM.
- Make the theme toggle's visible text describe the current state or use **“Light mode” / “Dark mode”** with `aria-pressed` reflecting the selected mode.
- Add `aria-describedby` to the report dialog.
- Keep the photo alt-text instructions; they are a model for the rest of the app.

### C24. Generic link and button labels

**Where:** `src/components/ClubFocusPanel.jsx:39`; `src/components/CommitmentsSection.jsx:417`; `src/pages/Home.jsx:330`; `src/pages/Network.jsx:297`

Examples:

> “Open the club's link”  
> “Read the notice”  
> “Read the notice” for every network post  
> “Details”

**Why it matters:** Generic labels force screen-reader users to open the link to know where it goes, and they make the interface feel less specific.

**Recommended:**

- Club focus link: use the link's actual title or **“Open [label]”** configured alongside the URL.
- Event/commitment: **“View event”** / **“View commitment.”**
- Network post: **“Read [post title]”** (already partially done in `aria-label`; make the visible text specific too).
- “Details” → **“Event details”** or **“View details.”**

### C25. Calendar metadata exposes the old brand

**Where:** `src/pages/EventDetail.jsx:30-32`; `src/pages/CommitmentDetail.jsx:41-43`; `src/utils/calendar.js:44`

Event calendars use `PRODID:-//CampusHub//Events//EN` and `UID:...@campushub`; commitment calendars use `Kesho`. Calendar clients may display the product name from this metadata.

**Recommended:** Use **Kesho** consistently in `PRODID`, UID domains, and downloaded filenames. Keep internal storage keys out of user-facing metadata.

### C26. “Vol. 01,” dates, and edition labels look like data but are decorative

**Where:** `src/components/Navbar.jsx:92`; `src/pages/Home.jsx:252-253`

“Vol. 01” never changes. The date is generated, but the volume is not. “Standalone edition” is a deployment mode.

**Recommended:**

- Remove “Vol. 01” or derive it from a real edition number.
- Remove “Standalone edition” from user-facing UI.
- If the editorial masthead needs a stable label, use **“Campus edition”** or the actual campus name.

### C27. Long explanatory paragraphs should be split or moved

**Where:** `src/pages/Network.jsx:209`; `src/pages/ClubProfile.jsx:178-180`, `:207-209`; `src/pages/FamilyProfile.jsx:142`; `src/pages/CampusAccess.jsx:179-203`; `src/pages/FamilySettings.jsx:176-181`

Examples:

> “This directory follows your approved affiliations. It shares club identity, events, commitments and notices explicitly published to the network. Membership and discussion stay with each campus chapter.”

**Why it matters:** These paragraphs combine three or four ideas in one block. On mobile they become walls of text, and users skim past the one rule that matters.

**Recommended:**

- Use a short lead sentence and a two- or three-item “What stays local” list.
- Example:

> **What you're seeing**
> Clubs, events and posts shared by your other campuses.
>
> **What stays local**
> Membership, comments and campus-only activity stay with each chapter.

- Keep one canonical boundary explanation and reuse it. Do not rewrite it on every page.

### C28. Raw post status is printed in the manager view

**Where:** `src/pages/PostDetail.jsx:136-140`

> “This post is **{post.status}**. Only managers of {club name} can see it. Restore it from the club desk to make it public again.”

**Why it matters:** `post.status` is a database value (`hidden` or `removed`). The sentence only reads cleanly when the value happens to be “hidden.” “Restore” is also wrong for a post that was removed by moderation rather than hidden by its club.

**Recommended:**

- Map each status to a sentence: **“This post is hidden from the public club page. Only club managers can see it.”** / **“This post was removed. Only club managers can see it.”**
- Change the action per status: **“Restore post”** for hidden, **“Review the report in the club desk”** for removed.
- Do not render a raw status value in a sentence.

### C29. One document title for every route, and no page description

**Where:** `index.html:7`; routing in `src/App.jsx`

Every page is **“Kesho — This week at campus”** in the browser tab. There is no meta description, canonical URL, or social preview copy. The phrase “at campus” is also less natural than “on campus.”

**Why it matters:** Tabs, history entries, bookmarks, search results, and shared links cannot distinguish a club page from an event page or the login screen. “At campus” reads as a translation error rather than an editorial choice.

**Recommended:**

- Set a route-specific title: **“Kesho — This week on campus,”** **“[Club name] — Kesho,”** **“[Event title] — Kesho,”** **“Log in — Kesho,”** and so on.
- Add a short static description: **“Find clubs and events across your campus, RSVP, and keep every commitment in one place.”**
- For public club/event/post pages, generate the description from the existing summary, trimmed to one sentence.
- Add `og:title`, `og:description`, and `og:image` copy once a branded share image exists. Do not ship a placeholder image URL.

---

## P3 — demo/seed content issues

The seed data is part of the product experience. These are content findings, not UI string findings.

| Where                               | Current                                                                                  | Issue                                                 | Recommended                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `server/campushub_database.sql:635` | “ahead of the state qualifiers”                                                          | US term in a Kenyan product                           | “ahead of the regional qualifiers”                       |
| `server/campushub_database.sql:670` | “local middle schoolers”                                                                 | US school stage                                       | “local school pupils” / “secondary school students”      |
| `server/campushub_database.sql:660` | “fall hackathon”                                                                         | US academic calendar                                  | “semester hackathon”                                     |
| `server/campushub_database.sql:655` | “spikes optional”                                                                        | Running jargon                                        | “running shoes optional”                                 |
| `server/campushub_database.sql:680` | “DJ crew”                                                                                | Fine for a social club; verify club reality           | Keep if the club actually has one                        |
| `server/campushub_database.sql:729` | “AgroConnect, a marketplace where Kenyan farmers list produce and buyers discover them.” | Promises a marketplace that is not visible in the app | Remove the product promise or link to the actual surface |
| `server/campushub_database.sql:675` | “tutoring program's”                                                                     | US spelling amid British copy                         | “tutoring programme's”                                   |
| Club descriptions                   | “all paces welcome,” “beginner-friendly,” etc.                                           | Strong, specific, credible                            | Keep; this is the right level of detail                  |

Also review the demo accounts' names and roles. “Amara Okafor (tier1)” and “Sofia Ramirez (member)” are fine as fictional people, but the parenthetical role should not be part of a public login button.

---

## Canonical terminology recommendation

This is the minimum glossary needed to stop the drift. It can live in a `COPY_GUIDE.md` later.

| Concept            | Use                                                                                   | Avoid                                                       |
| ------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Brand              | **Kesho** in prose; **kesho.** wordmark                                               | CampusHub, Campus Hub, campushub in user-facing copy        |
| Sign in            | **Log in** (verb), **Log out**, **login** (noun/adjective only when needed)           | Sign in, sign out, login as a verb                          |
| Create account     | **Sign up**, **Create account**                                                       | “Sign up” for events/commitments                            |
| Event action       | **RSVP**, **You're going**, **Cancel RSVP**, **Join waitlist**, **Leave waitlist**    | Join, commit, save your spot, sign up                       |
| Commitment action  | **Commit**, **You're committed**, **Withdraw**, **Join waitlist**, **Leave waitlist** | Join, RSVP, sign up                                         |
| Club action        | **Join club**, **Leave club**, **Member**                                             | Join (alone), sign up                                       |
| Umbrella list      | **My commitments**                                                                    | My events, my plans                                         |
| Event              | **Event**                                                                             | Notice, activity, happening                                 |
| Commitment         | **Commitment** (not “activity” in primary UI)                                         | Notice, task, shift, activity (unless the type is Activity) |
| Post               | **Post**; editorial kicker **Dispatch**                                               | Update, notice, announcement                                |
| Announcement       | **Announcement** (member-only)                                                        | Post, notice                                                |
| System alert       | **Notification**                                                                      | Notice                                                      |
| Club admin surface | **The desk** in navigation; **club desk** in prose                                    | Dashboard, admin panel, back office                         |
| Platform roles     | **Platform admin**, **campus admin**, **club admin**, **member**                      | Tier 1, Tier 1 admin, tier 2, tier2                         |
| Campus access      | **Additional campus**, **campus access**, **approved**                                | Affiliation, scoped, gated                                  |
| Club family        | **Club family**, **campus chapter**, **family logo**                                  | Family mark (unless defined), family admin                  |
| Capacity           | **Places** in member copy; **capacity** in admin labels                               | Seats, spots, spaces (pick one)                             |
| Waitlist           | **waitlist**, **on the waitlist**, **waitlist position**                              | Wait list, waiting list, queued                             |
| Time               | **18:00** with **EAT** where needed                                                   | Mixed 12/24-hour formats                                    |

### Voice rules

1. **Write to the person, not the system.** “We couldn't load this” beats “The request failed.”
2. **Name the action, not the state.** A button should say what happens when pressed.
3. **Explain the rule, not the schema.** “Only club admins can do this” beats “admin access required.”
4. **State the consequence before a destructive action.** “This removes 12 signups” belongs in the confirmation.
5. **Do not claim live, approved, current, or complete unless it is.** Static labels must not impersonate data.
6. **Keep the editorial voice for editorial moments.** “This week,” “Dispatch,” and “Stop press” are good. Do not use them for error messages or permission rules.
7. **One name for one thing.** Add a new synonym only when it describes a genuinely different object.

---

## Recommended fix order

### Batch 1 — trust and truth (highest impact, smallest surface)

1. Remove or gate demo credentials and the User/Admin path on login (C01).
2. Replace the console-based password reset message with a support path until email exists (C02).
3. Fix the network visibility contradiction everywhere (C03).
4. Replace API/storage error copy with user-facing connectivity copy (C04).
5. Remove hardcoded Strathmore/Nairobi/Main campus fallbacks and make “Campus live” truthful (C09).
6. Remove “Seed event” and the placeholder image from production (C11).
7. Fix false counts and empty states (C10, C17).
8. Add page titles and a meta description (C29).

### Batch 2 — one vocabulary

1. Standardize Log in / Sign up / RSVP / Commit / Join (C06, C07).
2. Choose the post/announcement/notification model and apply it (C08, C16).
3. Replace Tier 1/Tier 2 in every user-facing string (C05).
4. Standardize “The desk,” “club desk,” and “dashboard” (C15, C18).
5. Standardize places/spots/capacity and waitlist language (C07, C10).

### Batch 3 — forms, states, and accessibility

1. Rewrite login, reset, and session-expiry copy (C12, C20).
2. Standardize error titles and empty states (C17, C19).
3. Fix destructive confirmation labels (C15).
4. Add `role="alert"` and fix sidebar ARIA state (C23).
5. Replace generic link labels (C24).
6. Unify date/time formatting (C21).

### Batch 4 — content and localization

1. Remove US school idioms from seed data (P3).
2. Decide whether the product is Kenya-only; if not, remove “County” and “Nairobi” assumptions.
3. Rewrite long network/family explanations as short lead + boundary list (C27).
4. Remove “object storage,” “campus id,” and “slug” from primary labels where a human term works (C13, C18).
5. Update calendar metadata to Kesho (C25).

---

## Coverage log

### Reviewed in full

- **18 page components plus the app shell:** `App`, `CampusAccess`, `CampusSettings`, `ClubProfile`, `ClubWorkspace`, `CommitmentDetail`, `Dashboard`, `EventDetail`, `Families`, `FamilyProfile`, `FamilySettings`, `ForgotPassword`, `Home`, `Login`, `MyEvents`, `Network`, `NotFound`, `PostDetail`, `ResetPassword`.
- **25 shared components:** `AgriClubSpotlight`, `ClubAgenda`, `ClubCard`, `ClubFeed`, `ClubFocusPanel`, `ClubPostsDesk`, `CommentSection`, `CommitmentsSection`, `ConnectionStatus`, `ErrorBoundary`, `ErrorState`, `EventCard`, `Footer`, `MemberShell`, `Navbar`, `NextClubEvent`, `PasswordField`, `PostPhotoAltEditor`, `PostPhotoPicker`, `PostPhotos`, `ReportButton`, `SessionExpiryModal`, `Skeleton`, `ThemeToggle`, `Tier1ReportQueue`.
- **10 shared modules:** `api`, `authStore`, `commitmentsStore`, `dateTime`, `clubPlaybook`, `photoFiles`, `features`, `notificationsStore`, `reportsStore`, `AuthContext`.
- **Document metadata:** `index.html`.
- **Server-generated copy:** 320 error strings across `server/routes` (176 unique), auth/reset copy, report notification copy, commitment reschedule/cancellation notices, family-editor notification, and the reminder email template.
- **Seed content:** all 7 seeded clubs, the 12 seeded events, and the Agri club content in `server/campushub_database.sql`.

### Not reviewed line-by-line

- CSS-only visual treatment, including `text-transform: uppercase`; source copy may render in a different case than written.
- Browser-native validation messages (`required`, `minlength`, `type="email"`), which are controlled by the browser locale.
- Deployment scripts, `DEPLOYMENT.md`, `AUDIT.md`, and `P1_PLAN.md` except where they describe user-facing copy.
- Every one of the 320 API error strings individually. The audit covers all 176 unique messages by pattern and flags the technical ones; a full string-by-string rewrite should happen when the API error contract is next touched.
- Email deliverability and the actual rendered HTML of the reminder email. The plain-text and HTML templates were reviewed for wording.

---

## Open product decisions

These cannot be resolved by copy alone:

1. **Is “commitment” the umbrella for every RSVP, or only for dated activities?** The current “My commitments” page includes event RSVPs and commitment signups. If it remains the umbrella, the glossary above works. If not, rename the page to “My plans” or split it into “My events” and “My commitments.”
2. **Are announcements and posts both staying?** If yes, their audiences must be explicit. If not, remove the duplicate publishing surface.
3. **Is the product Kenya-only?** “County,” “Nairobi,” and “EAT” are appropriate for Kenya. A multi-country product needs region-neutral labels and a time-zone strategy.
4. **What is the public name of the club-admin surface?** “The desk” is distinctive; “Dashboard” is conventional. Pick one and use it in every heading, notification, and empty state.
5. **Is “family” understandable without explanation?** The metaphor works once explained, but “club family” is not self-evident. Consider “club network” if the family model is not central to the brand.
6. **Will email ever be enabled?** Until it is, the reset flow should be a support path, not a console-reading instruction. Once it is, the copy must switch to standard “check your inbox” language.

---

## Closing assessment

Kesho does not need a new voice. It needs a **copy system** that protects the existing voice from the parts of the product that were written by engineers for engineers.

The highest-leverage work is not a full rewrite. It is a short glossary, a pass over the login/reset/error surfaces, one decision about posts vs announcements, and one truthful explanation of what the network shares. Those changes would move the copy from “distinctive student project with rough edges” to “coherent product that happens to be built by students.”
