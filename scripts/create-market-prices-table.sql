-- ============================================
-- market_prices 表 - 存储 CLOB API 精确买卖价格
-- ============================================
-- 用途：从 CLOB API 获取每个 token 的实时买卖价格
-- 数据来源：https://clob.polymarket.com/prices
-- 更新频率：通过价格队列定期获取
-- 注意：这是独立的价格数据，不关联 Gamma API 价格

CREATE TABLE IF NOT EXISTS `market_prices` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  
  -- ===== 市场标识 =====
  `condition_id` VARCHAR(100) NOT NULL COMMENT '市场唯一标识 (关联 markets 表)',
  `token_id` VARCHAR(100) NOT NULL COMMENT 'Token ID (CLOB 交易用)',
  `outcome` VARCHAR(50) NOT NULL COMMENT '结果名称 (Yes/No 等)',
  `outcome_index` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '结果索引 (0=Yes, 1=No)',
  
  -- ===== CLOB 价格数据 =====
  `buy_price` DECIMAL(10, 4) NULL COMMENT '买一价 (CLOB BUY)',
  `sell_price` DECIMAL(10, 4) NULL COMMENT '卖一价 (CLOB SELL)',
  `mid_price` DECIMAL(10, 4) NULL COMMENT '中点价格 ((buy+sell)/2)',
  `spread` DECIMAL(10, 4) NULL COMMENT '买卖价差 (sell-buy)',
  `spread_pct` DECIMAL(8, 4) NULL COMMENT '价差百分比 (spread/mid*100)',
  
  -- ===== 时间戳 =====
  `fetched_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '价格获取时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '记录更新时间',
  
  PRIMARY KEY (`id`),
  
  -- 唯一索引：每个 token 只保留最新价格
  UNIQUE KEY `uk_token_id` (`token_id`),
  
  -- 查询索引
  KEY `idx_condition_id` (`condition_id`),
  KEY `idx_fetched_at` (`fetched_at`),
  KEY `idx_spread_pct` (`spread_pct`)
  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='市场精确价格表 - 存储 CLOB API 的实时买卖价格';


-- ============================================
-- market_price_snapshots 表 - 价格历史快照
-- ============================================
-- 用途：保存历史价格记录，用于分析价格变化趋势
-- 可选：如果需要追踪价格历史，取消下面的注释

/*
CREATE TABLE IF NOT EXISTS `market_price_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键',
  `token_id` VARCHAR(100) NOT NULL COMMENT 'Token ID',
  `buy_price` DECIMAL(10, 4) NULL COMMENT '买一价',
  `sell_price` DECIMAL(10, 4) NULL COMMENT '卖一价',
  `mid_price` DECIMAL(10, 4) NULL COMMENT '中点价格',
  `spread` DECIMAL(10, 4) NULL COMMENT '价差',
  `snapshot_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '快照时间',
  
  PRIMARY KEY (`id`),
  KEY `idx_token_snapshot` (`token_id`, `snapshot_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='价格历史快照表';
*/


-- ============================================
-- 添加表注释（如果表已存在）
-- ============================================
-- ALTER TABLE `market_prices` COMMENT='市场精确价格表 - 存储 CLOB API 的实时买卖价格';
