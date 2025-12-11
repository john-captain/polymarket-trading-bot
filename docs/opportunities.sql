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

 Date: 11/12/2025 15:25:44
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for opportunities
-- ----------------------------
DROP TABLE IF EXISTS `opportunities`;
CREATE TABLE `opportunities`  (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `condition_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '市场条件ID',
  `question` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '市场问题',
  `slug` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT NULL COMMENT '市场 slug',
  `strategy_type` enum('MINT_SPLIT','ARBITRAGE_LONG','ARBITRAGE_SHORT','MARKET_MAKING') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '策略类型',
  `price_sum` decimal(10, 6) NULL DEFAULT NULL COMMENT '价格总和',
  `spread` decimal(10, 4) NULL DEFAULT NULL COMMENT '价差百分比',
  `expected_profit` decimal(10, 4) NULL DEFAULT NULL COMMENT '预期利润 (美元)',
  `actual_profit` decimal(10, 4) NULL DEFAULT NULL COMMENT '实际利润 (美元)',
  `investment_amount` decimal(12, 4) NULL DEFAULT NULL COMMENT '投入金额 (美元)',
  `max_tradeable` decimal(12, 4) NULL DEFAULT NULL COMMENT '最大可交易金额',
  `tokens` json NULL COMMENT 'Token详情 [{tokenId, outcome, price, size, filled, status}, ...]',
  `status` enum('PENDING','QUEUED','EXECUTING','PARTIAL','SUCCESS','FAILED','EXPIRED','CANCELLED') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL DEFAULT 'PENDING' COMMENT '状态',
  `execution_steps` json NULL COMMENT '执行步骤 [{step, action, status, timestamp, txHash, error}, ...]',
  `trade_id` int NULL DEFAULT NULL COMMENT '关联的交易记录ID (trade_records)',
  `order_ids` json NULL COMMENT '关联的订单 ID 列表',
  `tx_hashes` json NULL COMMENT '交易哈希列表',
  `error_message` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT '错误信息',
  `retry_count` int NULL DEFAULT 0 COMMENT '重试次数',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  `queued_at` timestamp NULL DEFAULT NULL COMMENT '入队时间',
  `started_at` timestamp NULL DEFAULT NULL COMMENT '开始执行时间',
  `completed_at` timestamp NULL DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_condition_id`(`condition_id` ASC) USING BTREE,
  INDEX `idx_strategy_type`(`strategy_type` ASC) USING BTREE,
  INDEX `idx_status`(`status` ASC) USING BTREE,
  INDEX `idx_created_at`(`created_at` ASC) USING BTREE,
  INDEX `idx_strategy_status`(`strategy_type` ASC, `status` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 1 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '套利机会表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
