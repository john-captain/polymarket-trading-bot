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

 Date: 11/12/2025 15:25:19
*/

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- Table structure for strategy_configs
-- ----------------------------
DROP TABLE IF EXISTS `strategy_configs`;
CREATE TABLE `strategy_configs`  (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_type` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '策略类型',
  `enabled` tinyint(1) NULL DEFAULT 0 COMMENT '是否启用',
  `config` json NOT NULL COMMENT '策略配置 (JSON)',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) USING BTREE,
  UNIQUE INDEX `uk_strategy_type`(`strategy_type` ASC) USING BTREE
) ENGINE = InnoDB AUTO_INCREMENT = 12 CHARACTER SET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci COMMENT = '策略配置表' ROW_FORMAT = Dynamic;

SET FOREIGN_KEY_CHECKS = 1;
