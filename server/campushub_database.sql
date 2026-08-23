-- ============================================================================
-- CampusHub Database
-- Generated from the CampusHub React app (campushub2-main) to replace its
-- current localStorage/mockData.js simulation with a real MySQL backend.
-- Target: MySQL 5.7+/8.x via XAMPP (phpMyAdmin or `mysql` CLI).
--
-- HOW THIS MAPS TO THE APP
-- -------------------------------------------------------------------------
-- src/data/mockData.js   (clubs, events, CATEGORIES)   -> categories, clubs,
--                                                          club_tags, events
-- src/data/mockUsers.js  (users, adminForClubs)         -> users, club_admins
-- src/utils/authStore.js (login/signup, roles)          -> users
-- src/utils/eventsStore.js (custom events)              -> events
-- src/utils/storage.js   (signups)                      -> event_signups
-- src/utils/commentsStore.js (event/club comments)      -> comments
-- src/utils/dashboardStorage.js (announcements)         -> announcements
--
-- Three-tier role system preserved exactly as in authStore.canManageClub():
--   tier1  -> site-wide admin, can manage every club
--   tier2  -> club-scoped admin, can manage only clubs in club_admins
--   member -> no management rights
-- ============================================================================

DROP DATABASE IF EXISTS campushub;
CREATE DATABASE campushub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE campushub;

-- ----------------------------------------------------------------------------
-- categories
-- Backs the CATEGORIES constant in mockData.js. Normalized instead of an
-- ENUM so the club-fair/admin side can add a category without a migration.
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    category_id   INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- users
-- Backs mockUsers.js + authStore.signup(). No password column: the app's
-- "login" is account selection with no credential check (see authStore.js
-- login()/getCurrentUser()). Add a password_hash column later if the app
-- ever adds real authentication.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id       VARCHAR(30)  PRIMARY KEY,      -- e.g. 'user-01', or 'user-<timestamp>' from signup()
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE,
    role          ENUM('tier1', 'tier2', 'member') NOT NULL DEFAULT 'member',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- clubs
-- Backs the `clubs` array in mockData.js.
-- ----------------------------------------------------------------------------
CREATE TABLE clubs (
    club_id          VARCHAR(30) PRIMARY KEY,      -- e.g. 'club-01'
    name             VARCHAR(150) NOT NULL,
    category_id      INT NOT NULL,
    description      TEXT,
    logo_url         VARCHAR(500),
    meeting_time     VARCHAR(100),                 -- free text as in mockData, e.g. 'Tuesdays, 6:00 PM'
    meeting_location VARCHAR(150),
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_clubs_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- club_tags
-- Backs each club's `tags: [...]` array. One row per tag (normalized
-- instead of a comma-separated column so tags stay searchable/filterable).
-- ----------------------------------------------------------------------------
CREATE TABLE club_tags (
    tag_id     INT AUTO_INCREMENT PRIMARY KEY,
    club_id    VARCHAR(30) NOT NULL,
    tag        VARCHAR(50) NOT NULL,
    CONSTRAINT fk_club_tags_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uq_club_tag (club_id, tag)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- club_admins
-- Backs `adminForClubs: [...]` on a tier2 user. Modeled as a many-to-many
-- junction (rather than a single column) because the front-end data shape
-- already allows a tier2 user to admin more than one club, even though the
-- seed data only ever assigns one. canManageClub() effectively becomes:
--   tier1  -> can manage every club (no row needed)
--   tier2  -> can manage a club iff a matching row exists here
-- ----------------------------------------------------------------------------
CREATE TABLE club_admins (
    club_admin_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id       VARCHAR(30) NOT NULL,
    club_id       VARCHAR(30) NOT NULL,
    CONSTRAINT fk_club_admins_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_club_admins_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uq_user_club (user_id, club_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- events
-- Backs the `events` array in mockData.js AND the custom events an admin
-- creates on the Dashboard (eventsStore.saveCustomEvent) — one table for
-- both, matching how the app already merges seed + custom events into a
-- single list via getAllEvents().
-- ----------------------------------------------------------------------------
CREATE TABLE events (
    event_id      VARCHAR(30) PRIMARY KEY,        -- e.g. 'event-01' or 'custom-<timestamp>'
    club_id       VARCHAR(30) NOT NULL,
    title         VARCHAR(150) NOT NULL,
    description   TEXT,
    category_id   INT NOT NULL,
    event_date    DATE NOT NULL,                  -- mockData `date` (YYYY-MM-DD)
    event_time    TIME NOT NULL,                  -- mockData `time` (HH:MM)
    location      VARCHAR(150),
    image_url     VARCHAR(500),
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_events_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_events_category
        FOREIGN KEY (category_id) REFERENCES categories(category_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    INDEX idx_events_date_time (event_date, event_time)   -- supports dateTime.js sortByTimestamp/isPastEvent
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- event_signups
-- Backs storage.js. Name/email are snapshotted at signup time on purpose
-- (per the file's own v2 comment) so historical signups still display
-- correctly even if the user's account info changes later — do NOT
-- normalize these away by joining to users at read time.
-- ----------------------------------------------------------------------------
CREATE TABLE event_signups (
    signup_id      VARCHAR(30) PRIMARY KEY,        -- e.g. 'signup-<timestamp>'
    event_id       VARCHAR(30) NOT NULL,
    user_id        VARCHAR(30) NOT NULL,
    name_snapshot  VARCHAR(100) NOT NULL,
    email_snapshot VARCHAR(150) NOT NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_signups_event
        FOREIGN KEY (event_id) REFERENCES events(event_id)
        ON UPDATE CASCADE ON DELETE CASCADE,       -- mirrors pruneOrphanedSignups(): deleting the event clears its signups
    CONSTRAINT fk_signups_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    UNIQUE KEY uq_event_user (event_id, user_id)    -- enforces storage.js "no duplicate signups" rule at the DB level too
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- comments
-- Backs commentsStore.js. targetType/targetId is a polymorphic reference
-- (a comment can attach to an event OR a club), which MySQL can't enforce
-- with a single FK. target_id is intentionally left without an FK; the
-- application layer is responsible for validating it against events/clubs
-- before insert (exactly as CommentSection.jsx already does by construction).
-- ----------------------------------------------------------------------------
CREATE TABLE comments (
    comment_id      VARCHAR(30) PRIMARY KEY,       -- e.g. 'comment-<timestamp>'
    target_type     ENUM('event', 'club') NOT NULL,
    target_id       VARCHAR(30) NOT NULL,
    user_id         VARCHAR(30) NOT NULL,
    user_name_snapshot VARCHAR(100) NOT NULL,       -- mirrors the snapshot pattern used for signups
    comment_text    TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_comments_user
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    INDEX idx_comments_target (target_type, target_id, created_at)  -- supports getComments() oldest-first lookup
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- announcements
-- Backs dashboardStorage.js — club-scoped, admin-posted announcements.
-- ----------------------------------------------------------------------------
CREATE TABLE announcements (
    announcement_id VARCHAR(30) PRIMARY KEY,       -- e.g. 'announcement-<timestamp>'
    club_id         VARCHAR(30) NOT NULL,
    announcement_text TEXT NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_announcements_club
        FOREIGN KEY (club_id) REFERENCES clubs(club_id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- SEED DATA
-- Mirrors src/data/mockData.js and src/data/mockUsers.js exactly, so the
-- app's existing UI/filtering logic works unchanged against this database.
-- Event dates use MySQL's CURDATE() + INTERVAL to reproduce mockData.js's
-- daysFromNow(n) behavior (always-upcoming events, regardless of when this
-- script is run).
-- ============================================================================

-- Categories (order matches CATEGORIES in mockData.js)
INSERT INTO categories (name) VALUES
    ('Academic'),
    ('Arts & Culture'),
    ('Sports & Fitness'),
    ('Technology'),
    ('Community Service'),
    ('Social');

-- Users (mockUsers.js)
INSERT INTO users (user_id, name, email, role) VALUES
    ('user-01', 'Amara Okafor',   'amara.okafor@campus.edu',   'tier1'),
    ('user-02', 'Leo Fischer',    'leo.fischer@campus.edu',    'tier2'),
    ('user-03', 'Priya Nair',     'priya.nair@campus.edu',     'tier2'),
    ('user-04', 'Denis Mwangi',   'denis.mwangi@campus.edu',   'tier2'),
    ('user-05', 'Sofia Ramirez',  'sofia.ramirez@campus.edu',  'member'),
    ('user-06', 'Jamal Green',    'jamal.green@campus.edu',    'member'),
    ('user-07', 'Yuki Tanaka',    'yuki.tanaka@campus.edu',    'member'),
    ('user-08', 'Nadia Haddad',   'nadia.haddad@campus.edu',   'member');

-- Clubs (mockData.js `clubs`)
INSERT INTO clubs (club_id, name, category_id, description, logo_url, meeting_time, meeting_location) VALUES
    ('club-01', 'Debate & Rhetoric Society',
        (SELECT category_id FROM categories WHERE name = 'Academic'),
        'Weekly parliamentary-style debates and coaching for regional and national tournaments.',
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'Tuesdays, 6:00 PM', 'Humanities Hall, Room 214'),
    ('club-02', 'Lens Collective',
        (SELECT category_id FROM categories WHERE name = 'Arts & Culture'),
        'A photography and film club for students who want to shoot, edit, and screen their work together.',
        'https://images.unsplash.com/photo-1554080353-a576cf803bda?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'Wednesdays, 5:30 PM', 'Fine Arts Building, Studio 3'),
    ('club-03', 'Trailblazers Running Club',
        (SELECT category_id FROM categories WHERE name = 'Sports & Fitness'),
        'Casual and competitive group runs around campus and the river trail, all paces welcome.',
        'https://images.unsplash.com/photo-1739368732843-800f36a9b7d0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'Mon/Thu, 6:30 AM', 'Meet at the Rec Center steps'),
    ('club-04', 'Byte Club',
        (SELECT category_id FROM categories WHERE name = 'Technology'),
        'Hands-on workshops, hackathon prep, and project nights for anyone into building software.',
        'https://images.unsplash.com/photo-1758270705317-3ef6142d306f?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'Thursdays, 7:00 PM', 'Engineering Building, Lab 108'),
    ('club-05', 'Neighborhood Tutors',
        (SELECT category_id FROM categories WHERE name = 'Community Service'),
        'Student-run tutoring for local middle schoolers in math and reading, transport provided.',
        'https://images.unsplash.com/photo-1629360057380-18b15b42e650?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'Saturdays, 10:00 AM', 'Vans depart from Student Union'),
    ('club-06', 'Night Market Society',
        (SELECT category_id FROM categories WHERE name = 'Social'),
        'Monthly themed hangouts, game nights, and pop-up food events for meeting people outside your major.',
        'https://images.unsplash.com/photo-1528605248644-14dd04022da1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=200',
        'First Friday of the month, 7:00 PM', 'Courtyard, Building C');

-- Club tags (mockData.js `tags` per club)
INSERT INTO club_tags (club_id, tag) VALUES
    ('club-01', 'public-speaking'), ('club-01', 'competitive'), ('club-01', 'writing'),
    ('club-02', 'photography'),     ('club-02', 'film'),        ('club-02', 'creative'),
    ('club-03', 'running'),         ('club-03', 'fitness'),     ('club-03', 'outdoors'),
    ('club-04', 'coding'),          ('club-04', 'hackathon'),   ('club-04', 'workshops'),
    ('club-05', 'volunteering'),    ('club-05', 'education'),   ('club-05', 'community'),
    ('club-06', 'social'),          ('club-06', 'games'),       ('club-06', 'food');

-- Club admins (mockUsers.js `adminForClubs`, tier2 users only)
INSERT INTO club_admins (user_id, club_id) VALUES
    ('user-02', 'club-01'),
    ('user-03', 'club-04'),
    ('user-04', 'club-06');

-- Events (mockData.js `events`; dates reproduce daysFromNow(n) from today)
INSERT INTO events (event_id, club_id, title, description, category_id, event_date, event_time, location, image_url) VALUES
    ('event-01', 'club-01', 'Novice Debate Night',
        'An introductory round-robin for students who''ve never debated before.',
        (SELECT category_id FROM categories WHERE name = 'Academic'),
        CURDATE() + INTERVAL 3 DAY, '18:00', 'Humanities Hall, Room 214',
        'https://images.unsplash.com/photo-1515187029135-18ee286d815b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=600'),
    ('event-02', 'club-01', 'Regional Tournament Prep',
        'Coaching session ahead of the state qualifiers, bring your case files.',
        (SELECT category_id FROM categories WHERE name = 'Academic'),
        CURDATE() + INTERVAL 10 DAY, '17:30', 'Humanities Hall, Room 214',
        'https://images.stockcake.com/public/5/a/7/5a7c8768-76aa-49b1-95fc-1417b140d01a_large/intense-chess-match-stockcake.jpg'),
    ('event-03', 'club-02', 'Golden Hour Photowalk',
        'A guided walk across campus shooting available light, all skill levels.',
        (SELECT category_id FROM categories WHERE name = 'Arts & Culture'),
        CURDATE() + INTERVAL 2 DAY, '19:00', 'Meet at the Quad fountain',
        'https://images.unsplash.com/photo-1497316730643-415fac54a2af?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=600'),
    ('event-04', 'club-02', 'Short Film Screening Night',
        'Member-made shorts on the big screen, followed by an open critique.',
        (SELECT category_id FROM categories WHERE name = 'Arts & Culture'),
        CURDATE() + INTERVAL 14 DAY, '20:00', 'Fine Arts Building, Studio 3',
        'https://media.istockphoto.com/id/2193009902/photo/happy-audience-applauding-after-movie-premiere-at-cinema.jpg?s=612x612&w=0&k=20&c=nLatS-1SjCrTQZ9-GFpkptrFrdWzgImRryC5bGnbpsE='),
    ('event-05', 'club-03', 'River Trail 5K',
        'A social 5K along the river trail, coffee after at the Rec Center.',
        (SELECT category_id FROM categories WHERE name = 'Sports & Fitness'),
        CURDATE() + INTERVAL 1 DAY, '06:30', 'Rec Center steps',
        'https://images.unsplash.com/photo-1745790289741-12a211a8325d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w0NjA3NjB8MHwxfHJhbmRvbXx8fHx8fHx8fDE2OTg5NzQyMzM&ixlib=rb-4.0.3&q=80&w=600'),
    ('event-06', 'club-03', 'Interval Training Session',
        'Coached speed workout on the track, spikes optional.',
        (SELECT category_id FROM categories WHERE name = 'Sports & Fitness'),
        CURDATE() + INTERVAL 8 DAY, '06:30', 'Campus Track',
        'https://media.istockphoto.com/id/2164767186/photo/child-athlete-stretching-on-the-running-track.jpg?s=612x612&w=0&k=20&c=8hyIM8oxK_mzNql9_aOx2ff89haQZOUp8ADJ1PGl59c='),
    ('event-07', 'club-04', 'Hackathon Kickoff Workshop',
        'Team formation and a crash course in the tools you''ll need for the fall hackathon.',
        (SELECT category_id FROM categories WHERE name = 'Technology'),
        CURDATE() + INTERVAL 4 DAY, '19:00', 'Engineering Building, Lab 108',
        'https://images.stockcake.com/public/2/e/e/2ee809d0-2c47-4406-9ed6-da53d72f0e0b_large/hackathon-event-buzz-stockcake.jpg'),
    ('event-08', 'club-04', 'Intro to React Workshop',
        'A beginner-friendly build-along, laptops provided for anyone who needs one.',
        (SELECT category_id FROM categories WHERE name = 'Technology'),
        CURDATE() + INTERVAL 16 DAY, '18:30', 'Engineering Building, Lab 108',
        'https://media.istockphoto.com/id/2162645329/photo/teamwork-meeting-and-ideas-for-solution-or-decision-for-business-workplace-or-company-group.jpg?s=612x612&w=0&k=20&c=GTm_8uuh-QYmJQrWh2eNiQxVxaw-Vq7tN36GtjH44hc='),
    ('event-09', 'club-05', 'Saturday Tutoring Session',
        'Weekly math and reading support for local middle schoolers.',
        (SELECT category_id FROM categories WHERE name = 'Community Service'),
        CURDATE() + INTERVAL 3 DAY, '10:00', 'Vans depart from Student Union',
        'https://media.istockphoto.com/id/1998218845/photo/teacher-giving-tutoring-a-group-of-students-at-a-community-college.jpg?s=612x612&w=0&k=20&c=lccxQ8kbG3B75SnIhE6z89LzO8hoEFvYt5JiDr9bjYA='),
    ('event-10', 'club-05', 'School Supply Drive',
        'Pack and deliver supply kits for the tutoring program''s partner schools.',
        (SELECT category_id FROM categories WHERE name = 'Community Service'),
        CURDATE() + INTERVAL 11 DAY, '11:00', 'Student Union, Room 102',
        'https://media.istockphoto.com/id/1164996313/photo/children-volunteering-at-school-supply-donation-drive-at-elementary-school.jpg?s=612x612&w=0&k=20&c=DpN0BHyr6YyiZElgA-jPxHgJDCHDzeW2OQeq_3uGZzk='),
    ('event-11', 'club-06', 'Night Market Mixer',
        'Food stalls, board games, and a playlist run by the club''s DJ crew.',
        (SELECT category_id FROM categories WHERE name = 'Social'),
        CURDATE() + INTERVAL 2 DAY, '19:00', 'Courtyard, Building C',
        'https://images.stockcake.com/public/b/9/5/b95fe362-ee89-48ac-bae3-acfe181981a8_large/food-truck-festival-stockcake.jpg'),
    ('event-12', 'club-06', 'Trivia & Tacos',
        'Team trivia with a taco truck on standby, prizes for the top three teams.',
        (SELECT category_id FROM categories WHERE name = 'Social'),
        CURDATE() + INTERVAL 17 DAY, '19:30', 'Courtyard, Building C',
        'https://static.vecteezy.com/system/resources/thumbnails/070/862/969/small/group-of-friends-having-fun-and-competing-in-a-pub-trivia-night-photo.jpg');

-- Note: event_signups, comments, and announcements start empty — in the
-- app these are only ever created at runtime (sign-up form, comment box,
-- admin dashboard), so mockData.js/mockUsers.js has no seed rows for them.

-- ============================================================================
-- SAMPLE QUERIES — spot-check the schema mirrors the app's logic
-- ============================================================================

-- Home.jsx "All" tab: upcoming events with club name, soonest first (dateTime.js sortByTimestamp)
-- SELECT e.title, c.name AS club_name, e.event_date, e.event_time
-- FROM events e JOIN clubs c ON c.club_id = e.club_id
-- WHERE TIMESTAMP(e.event_date, e.event_time) >= NOW()
-- ORDER BY e.event_date, e.event_time;

-- authStore.canManageClub() equivalent: can user-03 manage club-04?
-- SELECT EXISTS (
--   SELECT 1 FROM users u
--   LEFT JOIN club_admins ca ON ca.user_id = u.user_id AND ca.club_id = 'club-04'
--   WHERE u.user_id = 'user-03' AND (u.role = 'tier1' OR ca.club_admin_id IS NOT NULL)
-- ) AS can_manage;

-- ClubProfile.jsx comment thread, oldest first (commentsStore.getComments)
-- SELECT user_name_snapshot, comment_text, created_at
-- FROM comments WHERE target_type = 'club' AND target_id = 'club-01'
-- ORDER BY created_at ASC;
