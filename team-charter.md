Group 7 Members
Rayyan Abdi Mohammed – 220763 -Backend dev/Integration/QA Lead
Hunja Michael Njagi – 220536- API Lead
Machisu Roy Minani – 219783- Backend dev/Integration/QA Lead
Wwaweru Tiphanie Nyaruiru – 220525-Docs/DevOps Lead

CampusHub App Audit
### What the app does

- Lets members browse and search clubs and events
- Lets members sign up for events and cancel signups
- Lets members comment on clubs and events
- Lets club admins post announcements
- Lets club admins create/edit/delete events for their club
- Lets tier1 admins create new clubs
- Lets tier1 admins promote users to tier2 (club) admin, or revoke it
- Lets members request admin access to a club; tier1 approves/denies
- Handles account signup, login, logout
- Handles forgot-password / reset-password via a token link

### What it stores

- User accounts: name, email, password hash, role (tier1/tier2/member)
- Password reset tokens: hashed token + expiry (temporary, cleared after use)
- Clubs: name, category, description, logo URL, meeting time/location
- Club tags (labels per club)
- Club-admin links (which tier2 users admin which clubs)
- Events: title, description, date/time, location, image URL, category, owning club
- Event signups: user, event, name/email snapshot at signup time
- Announcements: text, per club
- Comments: text, author name snapshot, linked to an event or club
- Admin requests: user, club, status (pending/approved/denied)

Ring Position
Who we are consuming from – group 6
Who will consume from us – group 8








One Paragraph Summary
CampusHub is a full-stack web application designed for students and other members of the school community to conveniently access and manage club and event-related information. The application provides an interactive front-end where users can submit and view information, while the backend processes and manages the data through APIs and stores it in a MySQL database hosted locally using XAMPP. It is intended to provide a centralized platform for managing student and campus information efficiently, reducing the need for manual record management and making important data easier to access, update, and maintain.

GitHub Repo Link
https://github.com/CrypticMachisu/campus_hub2.git
