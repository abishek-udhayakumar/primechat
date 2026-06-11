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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attachments`
--

LOCK TABLES `attachments` WRITE;
/*!40000 ALTER TABLE `attachments` DISABLE KEYS */;
INSERT INTO `attachments` VALUES (1,6,'69079419f2697_download.jpeg','uploads/images/1776761161_58e1641abc6b9604f7b9790baac0631e.jpeg','image/jpeg',18554,250,250,NULL,'2026-04-21 14:16:01'),(2,7,'AbishekUdhayakumarResume.pdf','uploads/files/1776761580_b0572ad43913a6750b7e27b2a0297e7d.pdf','application/pdf',145763,NULL,NULL,NULL,'2026-04-21 14:23:00'),(3,15,'EMI_Schedule_1776107938257.csv','uploads/files/1776765753_fedb64823d1cbf20d319707e0b186178.csv','text/plain',501,NULL,NULL,NULL,'2026-04-21 15:32:33'),(4,16,'voice_1776766030531.webm','uploads/voice/1776766030_6a4b16ceab3b31869952112abea873cc.webm','video/webm',207020,NULL,NULL,12,'2026-04-21 15:37:10'),(5,117,'voice_1777486298082.webm','uploads/voice/1777486298_3a7ccc62d0af9ec7cef08f1d7f994ffc.webm','video/webm',79508,NULL,NULL,4,'2026-04-29 23:41:38'),(6,118,'voice_1777486357245.webm','uploads/voice/1777486357_167349af8148614283204f230ddd1bda.webm','video/webm',49562,NULL,NULL,3,'2026-04-29 23:42:37'),(7,121,'333539985086.pdf','uploads/files/1777486452_9ba8f0885f7879a8855fc8d46eb1d1b8.pdf','application/pdf',215900,NULL,NULL,NULL,'2026-04-29 23:44:12');
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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversation_participants`
--

LOCK TABLES `conversation_participants` WRITE;
/*!40000 ALTER TABLE `conversation_participants` DISABLE KEYS */;
INSERT INTO `conversation_participants` VALUES (1,1,1,'2026-04-21 14:12:18',0,128),(2,1,2,'2026-04-21 14:12:18',0,127),(3,2,3,'2026-04-22 22:42:49',0,NULL),(4,2,1,'2026-04-22 22:42:49',0,101),(5,3,2,'2026-04-22 22:43:43',0,NULL),(6,3,3,'2026-04-22 22:43:43',0,78);
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `conversations`
--

LOCK TABLES `conversations` WRITE;
/*!40000 ALTER TABLE `conversations` DISABLE KEYS */;
INSERT INTO `conversations` VALUES (1,'direct',NULL,'2026-04-21 14:12:18','2026-06-11 00:32:57'),(2,'direct',NULL,'2026-04-22 22:42:49','2026-04-23 00:55:28'),(3,'direct',NULL,'2026-04-22 22:43:43','2026-04-22 22:43:51');
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
) ENGINE=InnoDB AUTO_INCREMENT=129 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `messages`
--

LOCK TABLES `messages` WRITE;
/*!40000 ALTER TABLE `messages` DISABLE KEYS */;
INSERT INTO `messages` VALUES (1,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:12:18','2026-04-21 14:12:18'),(2,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:10','2026-04-21 14:15:10'),(3,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:26','2026-04-21 14:15:26'),(4,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:45','2026-04-21 14:15:45'),(5,1,1,'Array','text',NULL,NULL,NULL,0,0,'2026-04-21 14:15:52','2026-04-21 14:15:52'),(6,1,2,'69079419f2697_download.jpeg','image',NULL,NULL,NULL,0,0,'2026-04-21 14:16:01','2026-04-21 14:16:01'),(7,1,2,'AbishekUdhayakumarResume.pdf','file',NULL,NULL,NULL,0,0,'2026-04-21 14:23:00','2026-04-21 14:23:00'),(8,1,2,'😝','text',NULL,NULL,NULL,0,0,'2026-04-21 14:28:53','2026-04-21 14:28:53'),(9,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:02:22','2026-04-21 15:02:22'),(10,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:02:53','2026-04-21 15:02:53'),(11,1,1,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 15:03:20','2026-04-21 15:03:20'),(12,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 15:18:31','2026-04-21 15:18:31'),(13,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:30:58','2026-04-21 15:30:58'),(14,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 15:31:17','2026-04-21 15:31:17'),(15,1,2,'EMI_Schedule_1776107938257.csv','file',NULL,NULL,NULL,0,0,'2026-04-21 15:32:33','2026-04-21 15:32:33'),(16,1,1,'voice_1776766030531.webm','voice',NULL,NULL,NULL,0,0,'2026-04-21 15:37:10','2026-04-21 15:37:10'),(17,1,1,'🥰🥰🥰🥰','text',NULL,NULL,NULL,0,0,'2026-04-21 15:41:55','2026-04-21 15:41:55'),(18,1,2,'❤️','text',NULL,NULL,NULL,0,0,'2026-04-21 15:42:23','2026-04-21 15:42:23'),(19,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:17:25','2026-04-21 16:17:25'),(20,1,1,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:17:51','2026-04-21 16:17:51'),(21,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 16:18:25','2026-04-21 16:18:25'),(22,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:19:14','2026-04-21 16:19:14'),(23,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:00','2026-04-21 16:21:00'),(24,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:15','2026-04-21 16:21:15'),(25,1,2,'what going on','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:43','2026-04-21 16:21:43'),(26,1,2,'when you available','text',NULL,NULL,NULL,0,0,'2026-04-21 16:21:53','2026-04-21 16:21:53'),(27,1,1,'11.30','text',NULL,NULL,NULL,0,0,'2026-04-21 16:24:10','2026-04-21 16:24:10'),(28,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:25:30','2026-04-21 16:25:30'),(29,1,2,'sure','text',NULL,NULL,NULL,0,0,'2026-04-21 16:25:46','2026-04-21 16:25:46'),(30,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:31:24','2026-04-21 16:31:24'),(31,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:31:49','2026-04-21 16:31:49'),(32,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:32:36','2026-04-21 16:32:36'),(33,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:32:50','2026-04-21 16:32:50'),(34,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-21 16:39:11','2026-04-21 16:39:11'),(35,1,2,'are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:39:33','2026-04-21 16:39:33'),(36,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:41:02','2026-04-21 16:41:02'),(37,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 16:41:58','2026-04-21 16:41:58'),(38,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:45:38','2026-04-21 16:45:38'),(39,1,2,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 16:46:47','2026-04-21 16:46:47'),(40,1,2,'ok','text',NULL,NULL,NULL,0,0,'2026-04-21 16:54:57','2026-04-21 16:54:57'),(41,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 16:55:12','2026-04-21 16:55:12'),(42,1,2,'hi','text',NULL,NULL,NULL,0,0,'2026-04-21 17:05:32','2026-04-21 17:05:32'),(43,1,2,'how are you','text',NULL,NULL,NULL,0,0,'2026-04-21 17:05:43','2026-04-21 17:05:43'),(44,1,1,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:03','2026-04-21 17:06:03'),(45,1,1,'fine','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:17','2026-04-21 17:06:17'),(46,1,2,'how going','text',NULL,NULL,NULL,0,0,'2026-04-21 17:06:31','2026-04-21 17:06:31'),(47,1,2,'good good','text',NULL,NULL,NULL,0,0,'2026-04-22 14:47:20','2026-04-22 14:47:20'),(48,1,1,'ya fine','text',NULL,NULL,NULL,0,0,'2026-04-22 14:47:36','2026-04-22 14:47:36'),(49,1,1,'whats up?','text',NULL,NULL,NULL,0,0,'2026-04-22 14:48:09','2026-04-22 14:48:09'),(50,1,2,'nothing','text',NULL,NULL,NULL,0,0,'2026-04-22 14:48:31','2026-04-22 14:48:31'),(51,1,2,'hi dude','text',NULL,NULL,NULL,0,0,'2026-04-22 16:30:25','2026-04-22 16:30:25'),(52,1,1,'whats going','text',NULL,NULL,NULL,0,0,'2026-04-22 16:30:49','2026-04-22 16:30:49'),(53,1,2,'everything good','text',NULL,NULL,NULL,0,0,'2026-04-22 16:31:02','2026-04-22 16:31:02'),(54,1,1,'hi','text',NULL,NULL,NULL,0,0,'2026-04-22 17:19:36','2026-04-22 17:19:36'),(55,1,1,'whats going','text',NULL,NULL,NULL,0,0,'2026-04-22 17:21:30','2026-04-22 17:21:30'),(56,1,1,'looks good','text',NULL,NULL,NULL,0,0,'2026-04-22 17:41:56','2026-04-22 17:41:56'),(57,1,1,'what','text',NULL,NULL,NULL,0,0,'2026-04-22 17:42:44','2026-04-22 17:42:44'),(58,1,1,'hwo','text',NULL,NULL,NULL,0,0,'2026-04-22 17:42:48','2026-04-22 17:42:48'),(59,1,2,'lol','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:13','2026-04-22 17:55:13'),(60,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:18','2026-04-22 17:55:18'),(61,1,1,'when','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:25','2026-04-22 17:55:25'),(62,1,1,'now','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:31','2026-04-22 17:55:31'),(63,1,1,'wht','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:37','2026-04-22 17:55:37'),(64,1,2,'how','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:43','2026-04-22 17:55:43'),(65,1,2,'when','text',NULL,NULL,NULL,0,0,'2026-04-22 17:55:47','2026-04-22 17:55:47'),(66,1,1,'now','text',NULL,NULL,NULL,0,0,'2026-04-22 17:58:29','2026-04-22 17:58:29'),(67,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-22 17:59:16','2026-04-22 17:59:16'),(68,1,1,'ok','text',NULL,NULL,NULL,0,0,'2026-04-22 17:59:20','2026-04-22 17:59:20'),(69,1,1,'whatsapp dude','text',NULL,NULL,'c_nw49o3kkv_1776862659065',0,0,'2026-04-22 18:27:39','2026-04-22 18:27:39'),(70,1,1,'good good','text',NULL,NULL,'c_1kijctxei_1776862667633',0,0,'2026-04-22 18:27:47','2026-04-22 18:27:47'),(71,1,2,'how going','text',NULL,NULL,'c_e7dpcrqlo_1776862681920',0,0,'2026-04-22 18:28:01','2026-04-22 18:28:01'),(72,1,2,'everthing good','text',NULL,NULL,'c_rzj8n3ws5_1776870596538',0,0,'2026-04-22 20:39:56','2026-04-22 20:39:56'),(73,1,1,'hi','text',NULL,NULL,'c_uvg4o0kxi_1776871402435',0,0,'2026-04-22 20:53:22','2026-04-22 20:53:22'),(74,1,1,'how was going','text',NULL,NULL,'c_6q3ky3ajq_1776871538901',0,0,'2026-04-22 20:55:38','2026-04-22 20:55:38'),(75,1,2,'what','text',NULL,NULL,'c_xfvsv4fej_1776871580994',0,0,'2026-04-22 20:56:20','2026-04-22 20:56:20'),(76,1,2,'how','text',NULL,NULL,'c_eh15wou8m_1776871609268',0,0,'2026-04-22 20:56:49','2026-04-22 20:56:49'),(77,2,3,'hi','text',NULL,NULL,'c_ow9sn3hr3_1776877974140',0,0,'2026-04-22 22:42:54','2026-04-22 22:42:54'),(78,3,2,'hi','text',NULL,NULL,'c_hc08ldhqi_1776878031207',0,0,'2026-04-22 22:43:51','2026-04-22 22:43:51'),(79,2,3,'hi','text',NULL,NULL,'c_6dp1nrywp_1776878063155',0,0,'2026-04-22 22:44:23','2026-04-22 22:44:23'),(80,1,1,'hi','text',NULL,NULL,'c_c22fgv9b6_1776878542583',0,0,'2026-04-22 22:52:22','2026-04-22 22:52:22'),(81,1,1,'hi','text',NULL,NULL,'c_70yv18up5_1776879041875',0,0,'2026-04-22 23:00:41','2026-04-22 23:00:41'),(82,1,1,'hi','text',NULL,NULL,'c_i1117x32o_1776879120909',0,0,'2026-04-22 23:02:00','2026-04-22 23:02:00'),(83,1,2,'hi','text',NULL,NULL,'c_9rewm9sf6_1776879891943',0,0,'2026-04-22 23:14:51','2026-04-22 23:14:51'),(84,1,2,'hi','text',NULL,NULL,'c_272d3qplz_1776879920242',0,0,'2026-04-22 23:15:20','2026-04-22 23:15:20'),(85,1,1,'hi','text',NULL,NULL,'c_k9buhsvci_1776879952470',0,0,'2026-04-22 23:15:52','2026-04-22 23:15:52'),(86,1,1,'hi','text',NULL,NULL,'c_xejcwpgee_1776880286074',0,0,'2026-04-22 23:21:26','2026-04-22 23:21:26'),(87,1,1,'hi','text',NULL,NULL,'c_3e563wl98_1776880310759',0,0,'2026-04-22 23:21:50','2026-04-22 23:21:50'),(88,1,1,'not fixed','text',NULL,NULL,'c_v351764hm_1776880337486',0,0,'2026-04-22 23:22:17','2026-04-22 23:22:17'),(89,1,1,'hi','text',NULL,NULL,'c_q5aj3dddk_1776880688189',0,0,'2026-04-22 23:28:08','2026-04-22 23:28:08'),(90,1,1,'hi','text',NULL,NULL,'c_uxya0vp80_1776881541055',0,0,'2026-04-22 23:42:21','2026-04-22 23:42:21'),(91,1,1,'hi','text',NULL,NULL,'c_gvma7ct7i_1776881845123',0,0,'2026-04-22 23:47:25','2026-04-22 23:47:25'),(92,1,2,'how are you','text',NULL,NULL,'c_xujulztky_1776881904928',0,0,'2026-04-22 23:48:24','2026-04-22 23:48:24'),(93,1,1,'fine','text',NULL,NULL,'c_gyjg0vn6m_1776882010644',0,0,'2026-04-22 23:50:10','2026-04-22 23:50:10'),(94,1,1,'ok','text',NULL,NULL,'c_4hk8brhr7_1776882572177',0,0,'2026-04-22 23:59:32','2026-04-22 23:59:32'),(95,1,2,'how was going da','text',NULL,NULL,'c_0xqinmvkc_1776882592268',0,0,'2026-04-22 23:59:52','2026-04-22 23:59:52'),(96,1,1,'going good','text',NULL,NULL,'c_rutd2ozwb_1776883142459',0,0,'2026-04-23 00:09:02','2026-04-23 00:09:02'),(97,2,3,'test-debug-msg','text',NULL,NULL,'c_dwwi40yrc_1776883826950',0,0,'2026-04-23 00:20:26','2026-04-23 00:20:26'),(98,2,3,'test-debug-msg-2','text',NULL,NULL,'debug_1776883862885',0,0,'2026-04-23 00:21:02','2026-04-23 00:21:02'),(99,2,3,'test-recipient-msg','text',NULL,NULL,'debug_recp_1776884033692',0,0,'2026-04-23 00:23:53','2026-04-23 00:23:53'),(100,1,2,'super','text',NULL,NULL,'c_uxswj7hwd_1776884341803',0,0,'2026-04-23 00:29:01','2026-04-23 00:29:01'),(101,2,3,'debug-test-123','text',NULL,NULL,'c_ttg7q3zxp_1776885928288',0,0,'2026-04-23 00:55:28','2026-04-23 00:55:28'),(102,1,1,'good good','text',NULL,NULL,'c_7yu5vm8zf_1776886383307',0,0,'2026-04-23 01:03:03','2026-04-23 01:03:03'),(103,1,2,'ok whatsup','text',NULL,NULL,'c_zc8ypvx6x_1777478820341',0,0,'2026-04-29 21:37:00','2026-04-29 21:37:00'),(104,1,1,'nothing da','text',NULL,NULL,'c_4pg7z11u4_1777478845225',0,0,'2026-04-29 21:37:25','2026-04-29 21:37:25'),(105,1,2,'ok','text',NULL,NULL,'c_cocagcirw_1777478861811',0,0,'2026-04-29 21:37:41','2026-04-29 21:37:41'),(106,1,1,'hi','text',NULL,NULL,'c_kjkcmpv57_1777479979053',0,0,'2026-04-29 21:56:19','2026-04-29 21:56:19'),(107,1,2,'how are you','text',NULL,NULL,'c_ef51o85xk_1777480012577',0,0,'2026-04-29 21:56:52','2026-04-29 21:56:52'),(108,1,1,'ok whats app','text',NULL,NULL,'c_yg7f4huw2_1777480029101',0,0,'2026-04-29 21:57:09','2026-04-29 21:57:09'),(109,1,2,'how','text',NULL,NULL,'c_6iqgei5jy_1777480956106',0,0,'2026-04-29 22:12:36','2026-04-29 22:12:36'),(110,1,1,'fone','text',NULL,NULL,'c_ddjyjo9m2_1777480962555',0,0,'2026-04-29 22:12:42','2026-04-29 22:12:42'),(111,1,2,'hi da','text',NULL,NULL,'c_ncpaqgvoz_1777481405476',0,0,'2026-04-29 22:20:05','2026-04-29 22:20:05'),(112,1,2,'how are you','text',NULL,NULL,'c_dmytsdgdg_1777481413333',0,0,'2026-04-29 22:20:13','2026-04-29 22:20:13'),(113,1,1,'fine da u','text',NULL,NULL,'c_khdaify68_1777481425169',0,0,'2026-04-29 22:20:25','2026-04-29 22:20:25'),(114,1,2,'ok da good','text',NULL,NULL,'c_xgdiiecdc_1777484598149',0,0,'2026-04-29 23:13:18','2026-04-29 23:13:18'),(115,1,1,'hi da','text',NULL,NULL,'c_pd1u5ef6g_1777485561569',0,0,'2026-04-29 23:29:21','2026-04-29 23:29:21'),(116,1,1,'hi da','text',NULL,NULL,'c_undazjs77_1777486266288',0,0,'2026-04-29 23:41:06','2026-04-29 23:41:06'),(117,1,1,'voice_1777486298082.webm','voice',NULL,NULL,NULL,0,0,'2026-04-29 23:41:38','2026-04-29 23:41:38'),(118,1,1,'voice_1777486357245.webm','voice',NULL,NULL,NULL,0,0,'2026-04-29 23:42:37','2026-04-29 23:42:37'),(119,1,2,'🖖','text',NULL,NULL,'c_xxpxh4h9w_1777486383551',0,0,'2026-04-29 23:43:03','2026-04-29 23:43:03'),(120,1,1,'what','text',NULL,NULL,'c_7ey2waefs_1777486399984',0,0,'2026-04-29 23:43:19','2026-04-29 23:43:19'),(121,1,1,'333539985086.pdf','file',NULL,NULL,NULL,0,0,'2026-04-29 23:44:12','2026-04-29 23:44:12'),(122,1,1,'hi','text',NULL,NULL,'c_7coof530c_1777486469614',0,0,'2026-04-29 23:44:29','2026-04-29 23:44:29'),(123,1,2,'enna da acchu','text',NULL,NULL,'c_r786gutjg_1777487166191',0,0,'2026-04-29 23:56:06','2026-04-29 23:56:06'),(124,1,1,'nothing da','text',NULL,NULL,'c_qn8fvly66_1777487206325',0,0,'2026-04-29 23:56:46','2026-04-29 23:56:46'),(125,1,1,'🙂🙂','text',NULL,NULL,'c_0lbr9o1jy_1777487224322',0,0,'2026-04-29 23:57:04','2026-04-29 23:57:04'),(126,1,2,'😫','text',NULL,NULL,'c_qb4v9yxbw_1777488047090',0,0,'2026-04-30 00:10:47','2026-04-30 00:10:47'),(127,1,1,'oii','text',NULL,NULL,'c_aqr7l9hiu_1777488909289',0,0,'2026-04-30 00:25:09','2026-04-30 00:25:09'),(128,1,2,'sollu i','text',NULL,NULL,'c_ueg4hy4ck_1781118177009',0,0,'2026-06-11 00:32:57','2026-06-11 00:32:57');
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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'cyber37','cyber123@gmail.com',NULL,NULL,'$2y$12$NnlF.JDN6rSIhHVbLmAzVu3/GOGhc2W30QW7gdD/haJD2iuZsWUD.','cyber',NULL,'tenacious','online','2026-06-11 00:53:48','gradient1','dark','2026-04-21 14:10:33','2026-06-11 00:53:48'),(2,'abi1','abi@gmail.com',NULL,NULL,'$2y$12$IxkMh32eWVS61Ntq0WB30.n2Sic1z/kfUfovBmqrt95OSivO2aTkK','abi',NULL,'tenacious','online','2026-06-11 00:53:58','default','dark','2026-04-21 14:11:41','2026-06-11 00:53:58'),(3,'abishek','abishek@example.com',NULL,NULL,'$2y$12$d9LmSs30qqpneBIJI8MSbe.SviA53S4ddOg6XZPWzUDcykBgBqai.','Abishek',NULL,'Hey there! I am using PrimeChat.','online','2026-04-23 01:33:01','default','light','2026-04-22 22:30:28','2026-04-23 01:33:01');
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

-- Dump completed on 2026-06-11  0:54:13
