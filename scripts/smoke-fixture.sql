-- Test-only fixture for `npm run smoke`. Never run this against production:
-- it changes event-01 to one seat and fills it with another demo user.
--
-- The smoke test uses the full event to exercise the waitlist path. The schema
-- seeds event_signups empty, so a fresh stack has no full event by default.
UPDATE events SET capacity = 1 WHERE event_id = 'event-01';

INSERT IGNORE INTO event_signups
    (signup_id, event_id, user_id, name_snapshot, email_snapshot)
VALUES
    ('signup-smoke-fixture', 'event-01', 'user-06', 'Jamal Green', 'jamal.green@campus.edu');
