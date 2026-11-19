# Phase gates and the Phase 6 decision

Decision recorded 19 November 2026, after Phase 5 network events, posts and
commitments.

## Does Phase 6 exist?

**No Phase 6 is currently defined.** Phases 1–4 are complete. Phase 5 is still
the active phase and still has unfinished participation and launch work.

A useful Phase 6 candidate is **launch hardening and public operations**, not
another social surface:

- public directory and family verification;
- moderation and reporting at network scale;
- observability, backups/restore, rate limits and operator runbooks;
- accessibility and performance audits on the real two-campus state;
- email/invitation reliability and data-retention policy.

Its weight is high only at launch. It is **lower priority than the Phase 5
completion and the open refinements**, because starting scale work before the
core multi-campus flows are complete would amplify unresolved behaviour.

## Order of work

1. Finish Phase 5.
2. Clear the refinements that affect comprehension or daily use.
3. Run the Phase 5 viability gate below.
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
- a public directory or verified public audience;
- a two-campus pilot with realistic demo data.

So the app is **fully viable as a single-campus product**, and **not yet fully
viable as a cross-university network**.

## Phase 5 exit gate

Do not call Phase 5 complete until all of these are true:

- [x] Network commitments have a documented participation model: one host
      roster, eligible member signup, host-campus discussion.
- [x] The automated two-campus API pilot covers a member with an approved
      affiliation through family, network discovery, events, posts, commitments
      and signup.
- [ ] A manual two-campus UI pilot is recorded with realistic preview data.
- [x] Anonymous, unaffiliated, tier-1 and campus-admin boundaries are tested.
- [x] Campus-only events, posts and commitments never appear in network results.
- [x] Family identity is public by decision; every chapter's activity remains
      campus-gated, and the policy is tested.
- [x] Family and network operations write audit entries; disabling the flag
      unmounts the routes without deleting data.
- [x] The feature is disabled without leaving stale navigation or endpoints in
      the client route table and navbar.
- [ ] A keyboard/screen-reader pass covers the scope switch, composers, family
      settings and remote profile boundaries.
- [ ] The supported paths have a performance check with the second campus.
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

**Not yet passed.** The automated boundary and participation checks pass, but
the gate remains blocked on:

1. a recorded manual two-campus UI pilot with realistic data;
2. a keyboard and screen-reader pass over the network, composer and family
   surfaces;
3. a measured performance check with the second campus.

Phase 6 does not start until those three are closed or explicitly waived.
