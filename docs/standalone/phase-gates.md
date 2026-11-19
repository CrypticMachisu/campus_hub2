# Phase gates and the Phase 6 decision

Decision recorded 19 November 2026, after Phase 5 network events, posts and
commitments.

## Does Phase 6 exist?

**No Phase 6 is currently defined.** Phases 1–5 are complete. The Phase 6
candidate is launch hardening and public operations, not another social surface.

A useful Phase 6 candidate is **launch hardening and public operations**, not
another social surface:

- public directory and family verification;
- moderation and reporting at network scale;
- observability, backups/restore, rate limits and operator runbooks;
- accessibility and performance audits on the real two-campus state;
- email/invitation reliability and data-retention policy.

Its weight is high only at launch. The remaining refinements are optional polish,
so Phase 6 can now be scoped without waiting for them.

## Order of work

1. ~~Finish Phase 5.~~
2. ~~Clear the refinements that affect comprehension or daily use.~~
3. ~~Run the Phase 5 viability gate below.~~
4. Decide whether the Phase 6 candidate is still needed, then scope it.
5. Only after that consider any further feature phase.

A P1 defect, privacy/security failure or data-loss risk jumps the queue. P2
polish waits until the Phase 5 boundary work is tested.

## Viability now

### What is fully viable

With the feature flag off, the single-campus app is functionally coherent:

- authentication and role boundaries;
- club discovery, membership, events, RSVPs and waitlists;
- commitments and attendance;
- posts, photos, comments and report moderation;
- campus settings and campus-scoped administration.

The default suite covers those paths and the production build succeeds.

### What is only partially viable

With the flag on, the network layer currently supports:

- approved affiliations and the My network directory;
- family identity, marks, delegated editors and chapter moves;
- network-published events and posts, read-only;
- network commitments with a single host roster and eligible-member signup;
- remote club identity pages;
- public family identity while campus activity stays gated.

It does **not** yet support:

- joining a chapter outside the home campus;
- network-aware post/comment permalinks and participation;
- a public directory or verified public audience.

A two-campus pilot is recorded in
[`phase-5-pilot.md`](./phase-5-pilot.md). The app is **fully viable as a
single-campus product**, and the tested Phase 5 network flows are viable for an
approved affiliated member.

## Phase 5 exit gate

Do not call Phase 5 complete until all of these are true:

- [x] Network commitments have a documented participation model: one host
      roster, eligible member signup, host-campus discussion.
- [x] The automated two-campus API pilot covers a member with an approved
      affiliation through family, network discovery, events, posts, commitments
      and signup.
- [x] A manual two-campus UI pilot is recorded with realistic preview data.
- [x] Anonymous, unaffiliated, tier-1 and campus-admin boundaries are tested.
- [x] Campus-only events, posts and commitments never appear in network results.
- [x] Family identity is public by decision; every chapter's activity remains
      campus-gated, and the policy is tested.
- [x] Family and network operations write audit entries; disabling the flag
      unmounts the routes without deleting data.
- [x] The feature is disabled without leaving stale navigation or endpoints in
      the client route table and navbar.
- [x] A keyboard/screen-reader pass covers the scope switch, composers, family
      settings and remote profile boundaries.
- [x] The supported paths have a performance check with the second campus.
- [x] The refinements that blocked comprehension in this slice are closed.

## Gate from Phase 6 onward

Every later phase ends with the same short viability review, not a feature demo:

1. **Core task** — can a new person complete the phase's main task without an
   operator?
2. **Role boundary** — does each role see only what it should, including
   negative tests?
3. **Content boundary** — can campus-only content leak into network or public
   surfaces?
4. **Failure path** — what happens when the API, storage or email is down?
5. **Rollback** — can the phase be disabled without deleting data?
6. **Accessibility** — keyboard, focus, labels and reduced motion.
7. **Performance** — the critical path measured with realistic data.
8. **Operations** — logs, backups, rate limits and a runbook.
9. **Regression** — default-off and enabled suites both pass.
10. **Decision** — record whether the next phase starts, waits for refinements,
    or is cancelled.

A phase can ship features and still fail this gate. The gate is about whether the
product still fulfils its original intent at that point, not whether the new
surface exists.

## Phase 5 gate result

**Passed 19 November 2026.** The automated suite, the recorded two-campus UI
pilot, the keyboard and accessibility-tree pass, and the warm API measurements
are all green. Evidence and timings are in
[`phase-5-pilot.md`](./phase-5-pilot.md).

The gate found and fixed four defects: the v2 event day shift, the wire label
overlap, the missing club-logo fallback and ambiguous family-boundary copy.
Phase 5 is complete.

## Phase 6 decision

**Deferred.** There is no public launch date and hosting stays local/free, so
backups, observability, public directory verification and operator runbooks have
no immediate consumer. The next work is the remaining optional refinements and
real usage feedback. Revisit this decision when a launch date, public audience or
remote deployment is proposed; scope Phase 6 then.
