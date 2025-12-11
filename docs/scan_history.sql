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

 Date: 11/12/2025 15:25:25
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for scan_history
-- ----------------------------
DROP TABLE IF EXISTS `scan_history`;
CREATE TABLE `scan_history`  (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `total_markets` int NOT NULL COMMENT '扫描的总市场数',
  `deviated_markets` int NULL DEFAULT 0 COMMENT '发现的偏离市场数',
  `opportunities_found` int NULL DEFAULT 0 COMMENT '发现的套利机会数',
  `scan_duration_ms` int NULL DEFAULT NULL COMMENT '扫描耗时(毫秒)',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 2791 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '扫描历史表 - 记录每次市场扫描的统计数据' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
