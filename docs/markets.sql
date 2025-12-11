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

 Date: 11/12/2025 15:25:50
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for markets
-- ----------------------------
DROP TABLE IF EXISTS `markets`;
CREATE TABLE `markets`  (
  `id` int NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `condition_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市场条件ID (唯一标识)',
  `question_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '问题ID',
  `slug` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'URL友好标识符',
  `question` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '市场问题描述',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '详细描述',
  `category` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '分类',
  `market_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT 'normal' COMMENT '市场类型 (normal/multi)',
  `end_date` datetime NULL DEFAULT NULL COMMENT '结束日期',
  `start_date` datetime NULL DEFAULT NULL COMMENT '开始日期',
  `created_at_api` datetime NULL DEFAULT NULL COMMENT 'API创建时间',
  `updated_at_api` datetime NULL DEFAULT NULL COMMENT 'API更新时间',
  `closed_time` datetime NULL DEFAULT NULL COMMENT '关闭时间',
  `outcomes` json NULL COMMENT '结果选项 (JSON数组)',
  `tokens` json NULL COMMENT 'CLOB Token IDs (JSON数组)',
  `active` tinyint(1) NULL DEFAULT 1 COMMENT '是否活跃',
  `closed` tinyint(1) NULL DEFAULT 0 COMMENT '是否已关闭',
  `archived` tinyint(1) NULL DEFAULT 0 COMMENT '是否已归档',
  `restricted` tinyint(1) NULL DEFAULT 0 COMMENT '是否受限',
  `enable_order_book` tinyint(1) NULL DEFAULT 1 COMMENT '是否启用订单簿',
  `fpmm_live` tinyint(1) NULL DEFAULT 0 COMMENT 'FPMM(AMM)是否启用',
  `cyom` tinyint(1) NULL DEFAULT 0 COMMENT '是否为用户创建的市场',
  `rfq_enabled` tinyint(1) NULL DEFAULT 0 COMMENT '是否启用RFQ',
  `holding_rewards_enabled` tinyint(1) NULL DEFAULT 0 COMMENT '是否启用持仓奖励',
  `fees_enabled` tinyint(1) NULL DEFAULT 0 COMMENT '是否启用手续费',
  `neg_risk_other` tinyint(1) NULL DEFAULT 0 COMMENT '负风险其他标志',
  `clear_book_on_start` tinyint(1) NULL DEFAULT 0 COMMENT '开始时清空订单簿',
  `manual_activation` tinyint(1) NULL DEFAULT 0 COMMENT '手动激活标志',
  `pending_deployment` tinyint(1) NULL DEFAULT 0 COMMENT '等待部署',
  `deploying` tinyint(1) NULL DEFAULT 0 COMMENT '正在部署',
  `rewards_min_size` decimal(20, 6) NULL DEFAULT 0.000000 COMMENT '奖励最小规模',
  `rewards_max_spread` decimal(10, 6) NULL DEFAULT 0.000000 COMMENT '奖励最大价差',
  `image` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '市场图片URL',
  `icon` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '图标URL',
  `twitter_card_image` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Twitter卡片图片',
  `events` json NULL COMMENT '关联事件数据 (JSON)',
  `tags` json NULL COMMENT '标签列表 (JSON)',
  `uma_resolution_statuses` json NULL COMMENT 'UMA解决状态 (JSON)',
  `market_maker_address` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT '做市商地址',
  `mailchimp_tag` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL COMMENT 'Mailchimp标签',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `accepting_orders` tinyint(1) NULL DEFAULT 1,
  `accepting_orders_timestamp` datetime NULL DEFAULT NULL,
  `order_min_size` decimal(20, 6) NULL DEFAULT 5.000000,
  `order_price_min_tick_size` decimal(10, 4) NULL DEFAULT 0.0100,
  `neg_risk` tinyint(1) NULL DEFAULT 0,
  `neg_risk_market_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `neg_risk_request_id` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `approved` tinyint(1) NULL DEFAULT 0,
  `ready` tinyint(1) NULL DEFAULT 0,
  `funded` tinyint(1) NULL DEFAULT 0,
  `featured` tinyint(1) NULL DEFAULT 0,
  `is_new` tinyint(1) NULL DEFAULT 0,
  `uma_bond` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `uma_reward` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `resolved_by` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `resolution_source` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
  `submitted_by` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `group_item_title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `group_item_threshold` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL DEFAULT NULL,
  `custom_liveness` int NULL DEFAULT 0,
  `synced_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '首次同步时间',
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `condition_id`(`condition_id` ASC) USING BTREE,
  INDEX `idx_condition_id`(`condition_id` ASC) USING BTREE,
  INDEX `idx_question_id`(`question_id` ASC) USING BTREE,
  INDEX `idx_slug`(`slug` ASC) USING BTREE,
  INDEX `idx_active`(`active` ASC) USING BTREE,
  INDEX `idx_closed`(`closed` ASC) USING BTREE,
  INDEX `idx_category`(`category` ASC) USING BTREE,
  INDEX `idx_end_date`(`end_date` ASC) USING BTREE,
  INDEX `idx_markets_accepting_orders`(`accepting_orders` ASC) USING BTREE,
  INDEX `idx_markets_neg_risk`(`neg_risk` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 286587 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = 'Polymarket 市场数据表 - 存储从 Gamma API 同步的完整市场信息' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
