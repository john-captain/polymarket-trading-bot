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

 Date: 11/12/2025 15:25:09
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for trade_records
-- ----------------------------
DROP TABLE IF EXISTS `trade_records`;
CREATE TABLE `trade_records`  (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `opportunity_id` int NULL DEFAULT NULL COMMENT '关联的套利机会ID',
  `market_question` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '市场问题描述',
  `trade_type` enum('LONG','SHORT') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '交易类型 (LONG/SHORT)',
  `yes_amount` decimal(15, 6) NULL DEFAULT NULL COMMENT 'Yes方向投入金额',
  `no_amount` decimal(15, 6) NULL DEFAULT NULL COMMENT 'No方向投入金额',
  `total_investment` decimal(15, 6) NULL DEFAULT NULL COMMENT '总投资金额',
  `expected_profit` decimal(15, 6) NULL DEFAULT NULL COMMENT '预期利润',
  `actual_profit` decimal(15, 6) NULL DEFAULT NULL COMMENT '实际利润',
  `status` enum('PENDING','SUCCESS','FAILED','SIMULATED') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'PENDING' COMMENT '交易状态 (PENDING/SUCCESS/FAILED/SIMULATED)',
  `tx_hash` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '交易哈希',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '错误信息',
  `created_at` datetime NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '交易记录表 - 存储所有套利交易的执行记录' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
