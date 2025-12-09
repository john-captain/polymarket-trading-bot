-- ==================== 套利机会表 ====================
-- 用于记录各策略发现的交易机会和执行结果

CREATE TABLE IF NOT EXISTS opportunities (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '自增主键',
  condition_id VARCHAR(100) NOT NULL COMMENT '市场条件ID',
  question VARCHAR(500) NOT NULL COMMENT '市场问题',
  slug VARCHAR(200) COMMENT '市场 slug',
  
  -- 策略信息
  strategy_type ENUM('MINT_SPLIT', 'ARBITRAGE_LONG', 'ARBITRAGE_SHORT', 'MARKET_MAKING') NOT NULL COMMENT '策略类型',
  
  -- 套利数据
  price_sum DECIMAL(10, 6) COMMENT '价格总和',
  spread DECIMAL(10, 4) COMMENT '价差百分比',
  expected_profit DECIMAL(10, 4) COMMENT '预期利润 (美元)',
  actual_profit DECIMAL(10, 4) COMMENT '实际利润 (美元)',
  
  -- 交易金额
  investment_amount DECIMAL(12, 4) COMMENT '投入金额 (美元)',
  max_tradeable DECIMAL(12, 4) COMMENT '最大可交易金额',
  
  -- Token 详情 (JSON 格式)
  tokens JSON COMMENT 'Token详情 [{tokenId, outcome, price, size, filled, status}, ...]',
  
  -- 执行状态
  status ENUM('PENDING', 'QUEUED', 'EXECUTING', 'PARTIAL', 'SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED') DEFAULT 'PENDING' COMMENT '状态',
  
  -- 执行步骤详情 (JSON 格式)
  execution_steps JSON COMMENT '执行步骤 [{step, action, status, timestamp, txHash, error}, ...]',
  
  -- 关联交易记录
  trade_id INT COMMENT '关联的交易记录ID (trade_records)',
  
  -- 订单信息
  order_ids JSON COMMENT '关联的订单 ID 列表',
  tx_hashes JSON COMMENT '交易哈希列表',
  
  -- 错误信息
  error_message TEXT COMMENT '错误信息',
  retry_count INT DEFAULT 0 COMMENT '重试次数',
  
  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  queued_at TIMESTAMP NULL COMMENT '入队时间',
  started_at TIMESTAMP NULL COMMENT '开始执行时间',
  completed_at TIMESTAMP NULL COMMENT '完成时间',
  
  -- 索引
  INDEX idx_condition_id (condition_id),
  INDEX idx_strategy_type (strategy_type),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at),
  INDEX idx_strategy_status (strategy_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='套利机会表';


-- ==================== 队列状态表 (可选) ====================
-- 用于持久化队列状态，支持服务重启后恢复

CREATE TABLE IF NOT EXISTS queue_status (
  id INT AUTO_INCREMENT PRIMARY KEY,
  queue_name VARCHAR(50) NOT NULL COMMENT '队列名称',
  current_size INT DEFAULT 0 COMMENT '当前队列长度',
  max_size INT COMMENT '最大容量',
  state ENUM('idle', 'running', 'paused', 'stopped') DEFAULT 'idle' COMMENT '运行状态',
  processed_count BIGINT DEFAULT 0 COMMENT '已处理任务数',
  error_count INT DEFAULT 0 COMMENT '错误数',
  last_task_at TIMESTAMP NULL COMMENT '最后任务时间',
  config JSON COMMENT '队列配置 (JSON)',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_queue_name (queue_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='队列状态表';


-- ==================== 策略配置表 ====================
-- 用于持久化策略配置，支持热更新

CREATE TABLE IF NOT EXISTS strategy_configs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  strategy_type VARCHAR(50) NOT NULL COMMENT '策略类型',
  enabled BOOLEAN DEFAULT FALSE COMMENT '是否启用',
  config JSON NOT NULL COMMENT '策略配置 (JSON)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_strategy_type (strategy_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略配置表';


-- ==================== 初始化策略配置 ====================

INSERT INTO strategy_configs (strategy_type, enabled, config) VALUES 
('MINT_SPLIT', true, JSON_OBJECT(
  'minPriceSum', 1.005,
  'minProfit', 0.01,
  'minProfitPercent', 0.3,
  'mintAmount', 10,
  'maxMintAmount', 100,
  'minOutcomes', 2,
  'maxSlippage', 2.0,
  'cooldownMs', 60000,
  'maxDailyLoss', 50
)),
('ARBITRAGE_LONG', true, JSON_OBJECT(
  'enabled', true,
  'minSpread', 1.0,
  'minProfit', 0.01,
  'tradeAmount', 10,
  'maxTradeAmount', 100,
  'maxSlippage', 2.0,
  'cooldownMs', 30000
)),
('ARBITRAGE_SHORT', true, JSON_OBJECT(
  'enabled', true,
  'minPriceSum', 1.005,
  'minProfit', 0.01,
  'tradeAmount', 10,
  'maxTradeAmount', 100,
  'maxSlippage', 2.0,
  'cooldownMs', 30000,
  'requireMint', true
)),
('MARKET_MAKING', false, JSON_OBJECT(
  'spreadPercent', 2.0,
  'orderSize', 10,
  'maxPositionSize', 100,
  'maxCapitalPerMarket', 500,
  'minLiquidity', 1000,
  'minVolume24hr', 500,
  'rebalanceThreshold', 20,
  'orderRefreshInterval', 60000,
  'mergeThreshold', 50
))
ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP;
