/*
 Navicat Premium Data Transfer

 Source Server         : wk-ali
 Source Server Type    : MySQL
 Source Server Version : 80044 (8.0.44-0ubuntu0.22.04.1)
 Source Host           : 8.216.35.110:3306
 Source Schema         : polymarket

 Target Server Type    : MySQL
 Target Server Version : 80044 (8.0.44-0ubuntu0.22.04.1)
 File Encoding         : 65001

 Date: 11/12/2025 15:25:31
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for queue_status
-- ----------------------------
DROP TABLE IF EXISTS `queue_status`;
CREATE TABLE `queue_status`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `queue_name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '队列名称',
  `current_size` int NULL DEFAULT 0 COMMENT '当前队列长度',
  `max_size` int NULL DEFAULT NULL COMMENT '最大容量',
  `state` enum('idle','running','paused','stopped') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'idle' COMMENT '运行状态',
  `processed_count` bigint NULL DEFAULT 0 COMMENT '已处理任务数',
  `error_count` int NULL DEFAULT 0 COMMENT '错误数',
  `last_task_at` timestamp NULL DEFAULT NULL COMMENT '最后任务时间',
  `config` json NULL COMMENT '队列配置 (JSON)',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_queue_name`(`queue_name` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '队列状态表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
