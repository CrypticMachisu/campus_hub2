-- ============================================================================
-- Kesho schema-only bootstrap
-- ============================================================================
-- Used for production-shaped deployments. It creates tables and reference
-- categories only: no demo users, clubs, events, commitments or opportunities.
--
-- The MySQL container creates and selects MYSQL_DATABASE before running this
-- file. Do not add CREATE/DROP DATABASE statements here.
--
-- After the first boot, create the first tier 1 operator with:
--   docker compose --env-file deploy/.env run --rm migrate npm run bootstrap:admin
-- ============================================================================


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `admin_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `admin_requests` (
  `request_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('pending','approved','denied') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`request_id`),
  KEY `fk_admin_requests_user` (`user_id`),
  KEY `fk_admin_requests_club` (`club_id`),
  CONSTRAINT `fk_admin_requests_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_admin_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agro_interest`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agro_interest` (
  `opportunity_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`opportunity_id`,`user_id`),
  KEY `fk_agro_interest_user` (`user_id`),
  CONSTRAINT `fk_agro_interest_opportunity` FOREIGN KEY (`opportunity_id`) REFERENCES `agro_opportunities` (`opportunity_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_agro_interest_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `agro_opportunities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `agro_opportunities` (
  `opportunity_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `location` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `county` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `capacity` int DEFAULT NULL,
  `host_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `farmer_id` int DEFAULT NULL,
  `source` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`opportunity_id`),
  KEY `idx_agro_starts` (`starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `announcements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `announcements` (
  `announcement_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `announcement_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`announcement_id`),
  KEY `fk_announcements_club` (`club_id`),
  CONSTRAINT `fk_announcements_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `audit_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `actor_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` varchar(60) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `detail` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `campus_email_domains`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campus_email_domains` (
  `domain` varchar(190) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`domain`),
  KEY `fk_campus_domain_campus` (`campus_id`),
  CONSTRAINT `fk_campus_domain_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`campus_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `campuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `campuses` (
  `campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`campus_id`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `category_id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `club_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `club_admins` (
  `club_admin_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`club_admin_id`),
  UNIQUE KEY `uq_user_club` (`user_id`,`club_id`),
  KEY `fk_club_admins_club` (`club_id`),
  CONSTRAINT `fk_club_admins_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_club_admins_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `club_families`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `club_families` (
  `family_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `home_campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('active','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `created_by` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`family_id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `fk_club_family_home_campus` (`home_campus_id`),
  KEY `fk_club_family_creator` (`created_by`),
  KEY `idx_club_families_status` (`status`,`name`),
  CONSTRAINT `fk_club_family_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_club_family_home_campus` FOREIGN KEY (`home_campus_id`) REFERENCES `campuses` (`campus_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `club_family_admins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `club_family_admins` (
  `family_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('lead','editor') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'lead',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`family_id`,`user_id`),
  KEY `fk_family_admin_user` (`user_id`),
  CONSTRAINT `fk_family_admin_family` FOREIGN KEY (`family_id`) REFERENCES `club_families` (`family_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_family_admin_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `club_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `club_members` (
  `membership_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`membership_id`),
  UNIQUE KEY `uq_member_club` (`user_id`,`club_id`),
  KEY `idx_club_members_club` (`club_id`),
  CONSTRAINT `fk_club_members_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_club_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `club_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `club_tags` (
  `tag_id` int NOT NULL AUTO_INCREMENT,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tag` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`tag_id`),
  UNIQUE KEY `uq_club_tag` (`club_id`,`tag`),
  CONSTRAINT `fk_club_tags_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `clubs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `clubs` (
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `family_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category_id` int NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meeting_time` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `meeting_location` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rsvp_label` varchar(40) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bring_note` varchar(240) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `focus_title` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `focus_body` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `focus_items` text COLLATE utf8mb4_unicode_ci,
  `focus_link` varchar(300) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`club_id`),
  UNIQUE KEY `uq_club_family_campus` (`family_id`,`campus_id`),
  KEY `fk_clubs_category` (`category_id`),
  KEY `idx_clubs_campus` (`campus_id`),
  KEY `idx_clubs_family` (`family_id`),
  CONSTRAINT `fk_clubs_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`campus_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_clubs_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_clubs_family` FOREIGN KEY (`family_id`) REFERENCES `club_families` (`family_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `comment_reactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comment_reactions` (
  `comment_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `emoji` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`,`user_id`,`emoji`),
  KEY `fk_reactions_user` (`user_id`),
  CONSTRAINT `fk_reactions_comment` FOREIGN KEY (`comment_id`) REFERENCES `comments` (`comment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reactions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `comments` (
  `comment_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_type` enum('event','club','commitment','post') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_name_snapshot` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment_text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `parent_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pinned` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`),
  KEY `fk_comments_user` (`user_id`),
  KEY `idx_comments_target` (`target_type`,`target_id`,`created_at`),
  KEY `idx_comments_parent` (`parent_id`),
  CONSTRAINT `fk_comments_parent` FOREIGN KEY (`parent_id`) REFERENCES `comments` (`comment_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comments_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commitment_signups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commitment_signups` (
  `signup_id` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `commitment_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_snapshot` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_snapshot` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reminder_sent_at` datetime DEFAULT NULL,
  `attendance` enum('unknown','attended','no_show') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unknown',
  PRIMARY KEY (`signup_id`),
  UNIQUE KEY `uq_commitment_user` (`commitment_id`,`user_id`),
  KEY `idx_commitment_signups_order` (`commitment_id`,`created_at`,`signup_id`),
  KEY `fk_commitment_signups_user` (`user_id`),
  CONSTRAINT `fk_commitment_signups_commitment` FOREIGN KEY (`commitment_id`) REFERENCES `commitments` (`commitment_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_commitment_signups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `commitments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `commitments` (
  `commitment_id` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'activity',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `location` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `county` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `starts_at` datetime NOT NULL,
  `capacity` int DEFAULT NULL,
  `host_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `source` varchar(12) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'admin',
  `audience` enum('campus','network','public') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'campus',
  `created_by` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`commitment_id`),
  KEY `idx_commitments_club_start` (`club_id`,`starts_at`),
  KEY `fk_commitments_creator` (`created_by`),
  CONSTRAINT `fk_commitments_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_commitments_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `event_signups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_signups` (
  `signup_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `event_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name_snapshot` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email_snapshot` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`signup_id`),
  UNIQUE KEY `uq_event_user` (`event_id`,`user_id`),
  KEY `fk_signups_user` (`user_id`),
  CONSTRAINT `fk_signups_event` FOREIGN KEY (`event_id`) REFERENCES `events` (`event_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_signups_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `event_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `category_id` int NOT NULL,
  `event_date` date NOT NULL,
  `event_time` time NOT NULL,
  `location` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bring_note` varchar(240) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `capacity` int DEFAULT NULL,
  `audience` enum('campus','network','public') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'campus',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`event_id`),
  KEY `fk_events_club` (`club_id`),
  KEY `fk_events_category` (`category_id`),
  KEY `idx_events_date_time` (`event_date`,`event_time`),
  CONSTRAINT `fk_events_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_events_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `notification_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci,
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notifications_user_created` (`user_id`,`created_at`),
  KEY `idx_notifications_unread` (`user_id`,`read_at`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `partner_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `partner_snapshots` (
  `cache_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `as_of` datetime NOT NULL,
  PRIMARY KEY (`cache_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `post_media`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `post_media` (
  `media_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `post_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `uploader_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storage_key` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnail_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `alt_text` varchar(300) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `decorative` tinyint(1) NOT NULL DEFAULT '0',
  `width` int DEFAULT NULL,
  `height` int DEFAULT NULL,
  `mime` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `position` tinyint unsigned NOT NULL DEFAULT '0',
  `status` enum('pending','ready') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`media_id`),
  UNIQUE KEY `uq_post_media_key` (`storage_key`),
  KEY `fk_post_media_club` (`club_id`),
  KEY `fk_post_media_uploader` (`uploader_id`),
  KEY `idx_post_media_post` (`post_id`,`position`),
  KEY `idx_post_media_pending` (`status`,`created_at`),
  CONSTRAINT `fk_post_media_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_post_media_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`post_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_post_media_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `posts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `posts` (
  `post_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `author_id` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `author_name_snapshot` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('published','hidden','removed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'published',
  `audience` enum('campus','network','public') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'campus',
  `pinned_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`),
  KEY `fk_posts_author` (`author_id`),
  KEY `idx_posts_club_created` (`club_id`,`status`,`created_at`),
  KEY `idx_posts_status_created` (`status`,`created_at`),
  KEY `idx_posts_club_pinned` (`club_id`,`status`,`pinned_at`),
  CONSTRAINT `fk_posts_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_posts_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `report_id` int NOT NULL AUTO_INCREMENT,
  `target_type` enum('post','comment','media') COLLATE utf8mb4_unicode_ci NOT NULL,
  `target_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reporter_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` enum('spam','harassment','off_topic','other') COLLATE utf8mb4_unicode_ci NOT NULL,
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('open','actioned','dismissed') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `resolution` enum('hidden','removed','dismissed') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `uq_report_once` (`reporter_id`,`target_type`,`target_id`),
  KEY `fk_reports_resolver` (`resolved_by`),
  KEY `idx_reports_club_status` (`club_id`,`status`,`created_at`),
  KEY `idx_reports_target` (`target_type`,`target_id`,`status`),
  CONSTRAINT `fk_reports_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_reports_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `user_campus_affiliations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_campus_affiliations` (
  `affiliation_id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `kind` enum('home','exchange','dual','staff','alumni','other') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'other',
  `status` enum('pending','active','denied','revoked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` datetime DEFAULT NULL,
  `decided_by` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`affiliation_id`),
  UNIQUE KEY `uq_user_campus_affiliation` (`user_id`,`campus_id`),
  KEY `fk_affiliation_decider` (`decided_by`),
  KEY `idx_affiliation_campus_status` (`campus_id`,`status`,`requested_at`),
  CONSTRAINT `fk_affiliation_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`campus_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_affiliation_decider` FOREIGN KEY (`decided_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_affiliation_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `user_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('tier1','campus_admin','tier2','member') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'member',
  `campus_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reset_token_hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_token_expires` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `email` (`email`),
  KEY `idx_users_campus` (`campus_id`),
  CONSTRAINT `fk_users_campus` FOREIGN KEY (`campus_id`) REFERENCES `campuses` (`campus_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workspace_pins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workspace_pins` (
  `pin_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `club_id` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_type` enum('announcement','comment') COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pinned_by` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pinned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`pin_id`),
  UNIQUE KEY `uq_workspace_pin` (`club_id`,`item_type`,`item_id`),
  KEY `idx_workspace_pins_club` (`club_id`,`pinned_at`),
  CONSTRAINT `fk_workspace_pins_club` FOREIGN KEY (`club_id`) REFERENCES `clubs` (`club_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- Reference data only. Application categories are part of the product, not
-- demo content, and club creation depends on them.
INSERT INTO categories (name) VALUES
    ('Academic'),
    ('Arts & Culture'),
    ('Sports & Fitness'),
    ('Technology'),
    ('Community Service'),
    ('Social'),
    ('Agriculture');
