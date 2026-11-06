-- Migration: add the Agriculture category, the Agri-Business & Farming Club
-- and its recruitment open-day event. The club's page (ClubProfile) shows
-- live AgroConnect data (Team 6) to market the platform and recruit members.
--
--   mysql -u root campushub < server/migrations/004_add_agriculture_club.sql
-- or paste it into phpMyAdmin's SQL tab with `campushub` selected.
-- Safe to run twice (INSERT IGNORE). Edit the meeting time/location to
-- whatever the club really uses.

USE campushub;

INSERT IGNORE INTO categories (name) VALUES ('Agriculture');

INSERT IGNORE INTO clubs
    (club_id, name, category_id, description, logo_url, meeting_time, meeting_location)
VALUES
    ('club-07', 'Agri-Business & Farming Club',
        (SELECT category_id FROM categories WHERE name = 'Agriculture'),
        'For students curious about farming, food systems and agri-business. We connect campus to real growers through AgroConnect, a marketplace where Kenyan farmers list produce and buyers discover them.',
        '/images/agri-club.svg',
        'Thursdays, 5:00 PM', 'Science Block, Room 105');

INSERT IGNORE INTO club_tags (club_id, tag) VALUES
    ('club-07', 'agriculture'), ('club-07', 'farming'),
    ('club-07', 'sustainability'), ('club-07', 'agribusiness');

INSERT IGNORE INTO events
    (event_id, club_id, title, description, category_id, event_date, event_time, location, image_url)
VALUES
    ('event-13', 'club-07', 'Agri Club Open Day: Meet the Growers',
        'Come see who is growing and selling on AgroConnect, learn how the club works with farmers, and sign up as a member.',
        (SELECT category_id FROM categories WHERE name = 'Agriculture'),
        CURDATE() + INTERVAL 7 DAY, '17:00', 'Science Block, Room 105',
        '/images/club-fair.svg');
