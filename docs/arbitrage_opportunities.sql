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

 Date: 11/12/2025 15:26:02
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for arbitrage_opportunities
-- ----------------------------
DROP TABLE IF EXISTS `arbitrage_opportunities`;
CREATE TABLE `arbitrage_opportunities`  (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `market_question` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '市场问题描述',
  `market_slug` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '市场URL标识',
  `condition_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '市场条件ID',
  `yes_price` decimal(10, 6) NOT NULL COMMENT 'Yes价格',
  `no_price` decimal(10, 6) NOT NULL COMMENT 'No价格',
  `price_sum` decimal(10, 6) NOT NULL COMMENT '价格总和',
  `spread` decimal(10, 4) NOT NULL COMMENT '价差百分比',
  `opportunity_type` enum('LONG','SHORT') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '机会类型 (LONG/SHORT)',
  `expected_profit` decimal(10, 4) NULL DEFAULT NULL COMMENT '预期利润',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_spread`(`spread` ASC) USING BTREE,
  INDEX `idx_type`(`opportunity_type` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '套利机会表 - 记录发现的套利机会' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
