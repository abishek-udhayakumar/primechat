-- MySQL dump 10.13  Distrib 8.0.45, for Linux (x86_64)
--
-- Host: localhost    Database: primechat
-- ------------------------------------------------------
-- Server version	8.0.45-0ubuntu0.24.04.1

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

--
-- Table structure for table `attachments`
--

DROP TABLE IF EXISTS `attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attachments` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int unsigned NOT NULL,
  `file_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_path` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_size` int unsigned NOT NULL DEFAULT '0',
  `width` int unsigned DEFAULT NULL,
  `height` int unsigned DEFAULT NULL,
  `duration` int unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_message` (`message_id`),
  CONSTRAINT `fk_att_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attachments`
--

LOCK TABLES `attachments` WRITE;
/*!40000 ALTER TABLE `attachments` DISABLE KEYS */;
INSERT INTO `attachments` VALUES (1,6,'69079419f2697_download.jpeg','uploads/images/1776761161_58e1641abc6b9604f7b9790baac0631e.jpeg','image/jpeg',18554,250,250,NULL,'2026-04-21 14:16:01'),(2,7,'AbishekUdhayakumarResume.pdf','uploads/files/1776761580_b0572ad43913a6750b7e27b2a0297e7d.pdf','application/pdf',145763,NULL,NULL,NULL,'2026-04-21 14:23:00'),(3,15,'EMI_Schedule_1776107938257.csv','uploads/files/1776765753_fedb64823d1cbf20d319707e0b186178.csv','text/plain',501,NULL,NULL,NULL,'2026-04-21 15:32:33'),(4,16,'voice_1776766030531.webm','uploads/voice/1776766030_6a4b16ceab3b31869952112abea873cc.webm','video/webm',207020,NULL,NULL,12,'2026-04-21 15:37:10');
/*!40000 ALTER TABLE `attachments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversation_participants`
--

DROP TABLE IF EXISTS `conversation_participants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation_participants` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unread_count` int unsigned NOT NULL DEFAULT '0',
  `last_read_message_id` int unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_conv_user` (`conversation_id`,`user_id`),
  KEY `idx_user_conv` (`user_id`,`conversation_id`),
  KEY `idx_user_unread` (`user_id`,`unread_count`),
  CONSTRAINT `fk_cp_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cp_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversation_participants`
--

LOCK TABLES `conversation_participants` WRITE;
/*!40000 ALTER TABLE `conversation_participants` DISABLE KEYS */;
INSERT INTO `conversation_participants` VALUES (1,1,1,'2026-04-21 14:12:18',0,65),(2,1,2,'2026-04-21 14:12:18',0,68);
/*!40000 ALTER TABLE `conversation_participants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `conversations`
--

DROP TABLE IF EXISTS `conversations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `type` enum('direct','group') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'direct',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
INSERT INTO `conversations` VALUES (1,'direct',NULL,'2026-04-21 14:12:18','2026-04-22 17:59:20');
/*!40000 ALTER TABLE `conversations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `message_deletions`
--

DROP TABLE IF EXISTS `message_deletions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `message_deletions` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `message_id` int unsigned NOT NULL,
  `user_id` int unsigned NOT NULL,
  `deleted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_msg_user` (`message_id`,`user_id`),
  KEY `fk_md_user` (`user_id`),
  CONSTRAINT `fk_md_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_md_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `message_deletions`
--

LOCK TABLES `message_deletions` WRITE;
/*!40000 ALTER TABLE `message_deletions` DISABLE KEYS */;
INSERT INTO `message_deletions` VALUES (1,9,1,'2026-04-21 15:02:31'),(2,13,2,'2026-04-21 15:31:08');
/*!40000 ALTER TABLE `message_deletions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `messages`
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` int unsigned NOT NULL,
  `sender_id` int unsigned NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci,
  `type` enum('text','image','file','voice','system') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'text',
  `reply_to_id` int unsigned DEFAULT NULL,
  `forwarded_from_id` int unsigned DEFAULT NULL,
  `client_msg_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_edited` tinyint(1) NOT NULL DEFAULT '0',
  `is_deleted_for_everyone` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `client_msg_id` (`client_msg_id`),
  KEY `idx_conv_created` (`conversation_id`,`created_at`),
  KEY `idx_conv_id` (`conversation_id`,`id`),
  KEY `idx_sender` (`sender_id`),
  KEY `idx_reply` (`reply_to_id`),
  KEY `fk_msg_forwarded` (`forwarded_from_id`),
  KEY `idx_conv_id_desc` (`conversation_id`,`id` DESC),
  CONSTRAINT `fk_msg_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_forwarded` FOREIGN KEY (`forwarded_from_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_msg_reply` FOREIGN KEY (`reply_to_id`) REFERENCES `messages` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_msg_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=69 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (1,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:12:18','2026-04-21 14:12:18'),(2,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:10','2026-04-21 14:15:10'),(3,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:26','2026-04-21 14:15:26'),(4,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:45','2026-04-21 14:15:45'),(5,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:52','2026-04-21 14:15:52'),(6,1,2,'69079419f2697_download.jpeg','image',NULL,NULL,NULL,0,0,'2026-04-21 14:16:01','2026-04-21 14:16:01'),(7,1,2,'AbishekUdhayakumarResume.pdf','file',NULL,NULL,NULL,0,0,'2026-04-21 14:23:00','2026-04-21 14:23:00'),(8,1,2,'😝','text',NULL,NULL,NULL,0,0,'2026-04-21 14:28:53','2026-04-21 14:28:53'),(9,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:02:22','2026-04-21 15:02:22'),(10,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:02:53','2026-04-21 15:02:53'),(11,1,1,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 15:03:20','2026-04-21 15:03:20'),(12,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 15:18:31','2026-04-21 15:18:31'),(13,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:30:58','2026-04-21 15:30:58'),(14,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:31:17','2026-04-21 15:31:17'),(15,1,2,'EMI_Schedule_1776107938257.csv','file',NULL,NULL,NULL,0,0,'2026-04-21 15:32:33','2026-04-21 15:32:33'),(16,1,1,'voice_1776766030531.webm','voice',NULL,NULL,NULL,0,0,'2026-04-21 15:37:10','2026-04-21 15:37:10'),(17,1,1,'🥰🥰🥰🥰','text',NULL,NULL,NULL,0,0,'2026-04-21 15:41:55','2026-04-21 15:41:55'),(18,1,2,'❤️','text',NULL,NULL,NULL,0,0,'2026-04-21 15:42:23','2026-04-21 15:42:23'),(19,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:17:25','2026-04-21 16:17:25'),(20,1,1,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:17:51','2026-04-21 16:17:51'),(21,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 16:18:25','2026-04-21 16:18:25'),(22,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:19:14','2026-04-21 16:19:14'),(23,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:00','2026-04-21 16:21:00'),(24,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:15','2026-04-21 16:21:15'),(25,1,2,'what going on','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:43','2026-04-21 16:21:43'),(26,1,2,'when you available','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:53','2026-04-21 16:21:53'),(27,1,1,'11.30','text',NULL,NULL,NULL,0,0,'2026-04-21 16:24:10','2026-04-21 16:24:10'),(28,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:25:30','2026-04-21 16:25:30'),(29,1,2,'sure','text',NULL,NULL,NULL,0,0,'2026-04-21 16:25:46','2026-04-21 16:25:46'),(30,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:31:24','2026-04-21 16:31:24'),(31,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:31:49','2026-04-21 16:31:49'),(32,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:32:36','2026-04-21 16:32:36'),(33,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:32:50','2026-04-21 16:32:50'),(34,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-21 16:39:11','2026-04-21 16:39:11'),(35,1,2,'are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:39:33','2026-04-21 16:39:33'),(36,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:41:02','2026-04-21 16:41:02'),(37,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:41:58','2026-04-21 16:41:58'),(38,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:45:38','2026-04-21 16:45:38'),(39,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 16:46:47','2026-04-21 16:46:47'),(40,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:54:57','2026-04-21 16:54:57'),(41,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:55:12','2026-04-21 16:55:12'),(42,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 17:05:32','2026-04-21 17:05:32'),(43,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 17:05:43','2026-04-21 17:05:43'),(44,1,1,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:03','2026-04-21 17:06:03'),(45,1,1,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:17','2026-04-21 17:06:17'),(46,1,2,'how going','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:31','2026-04-21 17:06:31'),(47,1,2,'good good','text',NULL,NULL,NULL,0,0,'2026-04-22 14:47:20','2026-04-22 14:47:20'),(48,1,1,'ya fine','text',NULL,NULL,NULL,0,0,'2026-04-22 14:47:36','2026-04-22 14:47:36'),(49,1,1,'whats up?','text',NULL,NULL,NULL,0,0,'2026-04-22 14:48:09','2026-04-22 14:48:09'),(50,1,2,'nothing','text',NULL,NULL,NULL,0,0,'2026-04-22 14:48:31','2026-04-22 14:48:31'),(51,1,2,'hi dude','text',NULL,NULL,NULL,0,0,'2026-04-22 16:30:25','2026-04-22 16:30:25'),(52,1,1,'whats going','text',NULL,NULL,NULL,0,0,'2026-04-22 16:30:49','2026-04-22 16:30:49'),(53,1,2,'everything good','text',NULL,NULL,NULL,0,0,'2026-04-22 16:31:02','2026-04-22 16:31:02'),(54,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-22 17:19:36','2026-04-22 17:19:36'),(55,1,1,'whats going','text',NULL,NULL,NULL,0,0,'2026-04-22 17:21:30','2026-04-22 17:21:30'),(56,1,1,'looks good','text',NULL,NULL,NULL,0,0,'2026-04-22 17:41:56','2026-04-22 17:41:56'),(57,1,1,'what','text',NULL,NULL,NULL,0,0,'2026-04-22 17:42:44','2026-04-22 17:42:44'),(58,1,1,'hwo','text',NULL,NULL,NULL,0,0,'2026-04-22 17:42:48','2026-04-22 17:42:48'),(59,1,2,'lol','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:13','2026-04-22 17:55:13'),(60,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:18','2026-04-22 17:55:18'),(61,1,1,'when','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:25','2026-04-22 17:55:25'),(62,1,1,'now','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:31','2026-04-22 17:55:31'),(63,1,1,'wht','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:37','2026-04-22 17:55:37'),(64,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:43','2026-04-22 17:55:43'),(65,1,2,'when','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:47','2026-04-22 17:55:47'),(66,1,1,'now','text',NULL,NULL,NULL,0,0,'2026-04-22 17:58:29','2026-04-22 17:58:29'),(67,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-22 17:59:16','2026-04-22 17:59:16'),(68,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-22 17:59:20','2026-04-22 17:59:20');
/*!40000 ALTER TABLE `messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `typing_status`
--

DROP TABLE IF EXISTS `typing_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `typing_status` (
  `user_id` int unsigned NOT NULL,
  `conversation_id` int unsigned NOT NULL,
  `started_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`conversation_id`),
  KEY `idx_conv` (`conversation_id`),
  CONSTRAINT `fk_ts_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `typing_status`
--

LOCK TABLES `typing_status` WRITE;
/*!40000 ALTER TABLE `typing_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `typing_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_normalized` varchar(15) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `avatar_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `about` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT 'Hey there! I am using PrimeChat.',
  `status` enum('online','offline','away') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'offline',
  `last_seen` datetime DEFAULT NULL,
  `wallpaper` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'default',
  `theme` enum('light','dark') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'dark',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  UNIQUE KEY `uk_email` (`email`),
  KEY `idx_phone_normalized` (`phone_normalized`),
  KEY `idx_status` (`status`),
  KEY `idx_username_search` (`username`),
  KEY `idx_status_seen` (`status`,`last_seen`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'cyber37','cyber123@gmail.com',NULL,NULL,'$2y$12$NnlF.JDN6rSIhHVbLmAzVu3/GOGhc2W30QW7gdD/haJD2iuZsWUD.','cyber',NULL,'tenacious','online','2026-04-22 18:06:49','gradient1','dark','2026-04-21 14:10:33','2026-04-22 18:06:49'),(2,'abi1','abi@gmail.com',NULL,NULL,'$2y$12$IxkMh32eWVS61Ntq0WB30.n2Sic1z/kfUfovBmqrt95OSivO2aTkK','abi',NULL,'tenacious','online','2026-04-22 18:07:16','default','dark','2026-04-21 14:11:41','2026-04-22 18:07:16');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-04-22 18:07:31
