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

 Date: 11/12/2025 15:25:56
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for market_price_history
-- ----------------------------
DROP TABLE IF EXISTS `market_price_history`;
CREATE TABLE `market_price_history`  (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `condition_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '关联市场的条件ID',
  `outcome_prices` json NULL COMMENT '当时的价格 (JSON数组)',
  `best_bid` decimal(10, 6) NULL DEFAULT NULL COMMENT '当时的最佳买价',
  `best_ask` decimal(10, 6) NULL DEFAULT NULL COMMENT '当时的最佳卖价',
  `spread` decimal(10, 6) NULL DEFAULT NULL COMMENT '当时的买卖价差',
  `last_trade_price` decimal(10, 6) NULL DEFAULT NULL COMMENT '当时的最后成交价',
  `volume` decimal(20, 6) NULL DEFAULT NULL COMMENT '当时的总交易量',
  `volume_24hr` decimal(20, 6) NULL DEFAULT NULL COMMENT '当时的24小时交易量',
  `liquidity` decimal(20, 6) NULL DEFAULT NULL COMMENT '当时的流动性',
  `recorded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录时间',
  `volume_1wk` decimal(20, 6) NULL DEFAULT NULL COMMENT '7天交易量',
  `volume_1mo` decimal(20, 6) NULL DEFAULT NULL COMMENT '30天交易量',
  `volume_1yr` decimal(20, 6) NULL DEFAULT NULL COMMENT '年交易量',
  `volume_1wk_amm` decimal(20, 6) NULL DEFAULT NULL COMMENT '7天AMM交易量',
  `volume_1mo_amm` decimal(20, 6) NULL DEFAULT NULL COMMENT '30天AMM交易量',
  `volume_1yr_amm` decimal(20, 6) NULL DEFAULT NULL COMMENT '年AMM交易量',
  `volume_1wk_clob` decimal(20, 6) NULL DEFAULT NULL COMMENT '7天CLOB交易量',
  `volume_1mo_clob` decimal(20, 6) NULL DEFAULT NULL COMMENT '30天CLOB交易量',
  `volume_1yr_clob` decimal(20, 6) NULL DEFAULT NULL COMMENT '年CLOB交易量',
  `volume_clob` decimal(30, 6) NULL DEFAULT NULL COMMENT 'CLOB总交易量',
  `liquidity_amm` decimal(20, 6) NULL DEFAULT NULL COMMENT 'AMM流动性',
  `liquidity_clob` decimal(20, 6) NULL DEFAULT NULL COMMENT 'CLOB流动性',
  `one_hour_price_change` decimal(10, 6) NULL DEFAULT NULL COMMENT '1小时价格变化',
  `one_day_price_change` decimal(10, 6) NULL DEFAULT NULL COMMENT '24小时价格变化',
  `one_week_price_change` decimal(10, 6) NULL DEFAULT NULL COMMENT '7天价格变化',
  `one_month_price_change` decimal(10, 6) NULL DEFAULT NULL COMMENT '30天价格变化',
  `one_year_price_change` decimal(10, 6) NULL DEFAULT NULL COMMENT '年价格变化',
  `competitive` decimal(10, 2) NULL DEFAULT NULL COMMENT '竞争度评分',
  `comment_count` int NULL DEFAULT NULL COMMENT '评论数',
  PRIMARY KEY (`id`) USING BTREE,
  INDEX `idx_condition_id`(`condition_id` ASC) USING BTREE,
  INDEX `idx_recorded_at`(`recorded_at` ASC) USING BTREE,
  INDEX `idx_condition_time`(`condition_id` ASC, `recorded_at` ASC) USING BTREE,
  INDEX `idx_mph_condition_recorded`(`condition_id` ASC, `recorded_at` DESC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 575142 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci COMMENT = '市场价格历史表 - 记录市场价格随时间的变化' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
