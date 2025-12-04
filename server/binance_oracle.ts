/**
 * Binance 预言机 - 使用 Binance WebSocket 提供实时价格和概率
 */
import WebSocket from 'ws';

interface PriceData {
    UP: number;
    DOWN: number;
}

interface BinanceTicker {
    c: string;  // 当前价格
    p: string;  // 24小时价格变化
    P: string;  // 24小时价格变化百分比
}

export class BinanceOracle {
    private ws: WebSocket | null = null;
    private hourlyOpen: number = 0;
    private isConnected: boolean = false;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private hourlyResetInterval: NodeJS.Timeout | null = null;
    
    // 回调函数
    private onPriceUpdate: ((prices: PriceData) => void) | null = null;
    private onConnectionChange: ((connected: boolean) => void) | null = null;
    
    // 配置参数
    private readonly WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@ticker';
    private readonly RECONNECT_DELAY = 5000; // 5秒重连
    private readonly SENSITIVITY = 3; // 灵敏度：价格变化1%会影响概率的倍数
    private readonly MAX_PROBABILITY_SHIFT = 0.40; // 最大概率偏移40%
    
    constructor() {
        console.log('🔧 初始化 Binance 预言机...');
    }
    
    /**
     * 连接到 Binance WebSocket
     */
    connect(): void {
        if (this.ws && this.isConnected) {
            console.log('⚠️  Binance 预言机已经连接');
            return;
        }
        
        console.log('📡 正在连接到 Binance WebSocket...');
        
        try {
            this.ws = new WebSocket(this.WS_URL);
            
            this.ws.on('open', () => {
                console.log('✅ Binance WebSocket 已连接！');
                this.isConnected = true;
                
                if (this.onConnectionChange) {
                    this.onConnectionChange(true);
                }
                
                // 设置每小时重置开盘价
                this.startHourlyReset();
            });
            
            this.ws.on('message', (data: WebSocket.Data) => {
                this.handleMessage(data);
            });
            
            this.ws.on('error', (error: Error) => {
                console.error('❌ Binance WebSocket 错误:', error.message);
                this.isConnected = false;
                
                if (this.onConnectionChange) {
                    this.onConnectionChange(false);
                }
            });
            
            this.ws.on('close', () => {
                console.log('⚠️  Binance WebSocket 连接已关闭');
                this.isConnected = false;
                
                if (this.onConnectionChange) {
                    this.onConnectionChange(false);
                }
                
                // 自动重连
                this.scheduleReconnect();
            });
            
        } catch (error) {
            console.error('❌ 创建 WebSocket 连接失败:', error);
            this.scheduleReconnect();
        }
    }
    
    /**
     * 处理收到的消息
     */
    private handleMessage(data: WebSocket.Data): void {
        try {
            const ticker: BinanceTicker = JSON.parse(data.toString());
            const currentPrice = parseFloat(ticker.c);
            
            // 初始化小时开盘价
            if (this.hourlyOpen === 0) {
                this.hourlyOpen = currentPrice;
                console.log(`📌 小时开盘价设定为: $${this.hourlyOpen.toFixed(2)}`);
            }
            
            // 计算概率
            const prices = this.calculateProbabilities(currentPrice);
            
            // 触发回调
            if (this.onPriceUpdate) {
                this.onPriceUpdate(prices);
            }
            
        } catch (error) {
            console.error('❌ 解析 Binance 数据失败:', error);
        }
    }
    
    /**
     * 计算 UP/DOWN 概率
     */
    private calculateProbabilities(currentPrice: number): PriceData {
        // 计算相对小时开盘价的变化
        const hourlyChange = currentPrice - this.hourlyOpen;
        const hourlyChangePercent = (hourlyChange / this.hourlyOpen) * 100;
        
        // 基础概率 50%
        let probUp = 0.50;
        
        if (hourlyChange > 0) {
            // 价格上涨 → UP 概率增加
            probUp = 0.50 + Math.min(hourlyChangePercent * this.SENSITIVITY, this.MAX_PROBABILITY_SHIFT);
        } else {
            // 价格下跌 → DOWN 概率增加
            probUp = 0.50 + Math.max(hourlyChangePercent * this.SENSITIVITY, -this.MAX_PROBABILITY_SHIFT);
        }
        
        // 限制概率范围在 10%-90%
        probUp = Math.max(0.10, Math.min(0.90, probUp));
        const probDown = 1 - probUp;
        
        return {
            UP: probUp,
            DOWN: probDown
        };
    }
    
    /**
     * 设置价格更新回调
     */
    onPrice(callback: (prices: PriceData) => void): void {
        this.onPriceUpdate = callback;
    }
    
    /**
     * 设置连接状态变化回调
     */
    onConnection(callback: (connected: boolean) => void): void {
        this.onConnectionChange = callback;
    }
    
    /**
     * 计划重连
     */
    private scheduleReconnect(): void {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
        }
        
        console.log(`🔄 ${this.RECONNECT_DELAY / 1000}秒后尝试重连 Binance...`);
        
        this.reconnectTimeout = setTimeout(() => {
            console.log('🔄 正在重连 Binance...');
            this.connect();
        }, this.RECONNECT_DELAY);
    }
    
    /**
     * 启动每小时重置逻辑
     */
    private startHourlyReset(): void {
        if (this.hourlyResetInterval) {
            clearInterval(this.hourlyResetInterval);
        }
        
        // 每小时重置开盘价
        this.hourlyResetInterval = setInterval(() => {
            console.log('🔔 新小时开始！重置开盘价...');
            this.hourlyOpen = 0; // 下次更新时会重新设置
        }, 3600000); // 1小时
    }
    
    /**
     * 断开连接
     */
    disconnect(): void {
        console.log('🛑 断开 Binance 预言机连接...');
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        
        if (this.hourlyResetInterval) {
            clearInterval(this.hourlyResetInterval);
            this.hourlyResetInterval = null;
        }
        
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.close();
            this.ws = null;
        }
        
        this.isConnected = false;
        this.hourlyOpen = 0;
        
        console.log('✅ Binance 预言机已断开');
    }
    
    /**
     * 获取连接状态
     */
    getConnectionStatus(): boolean {
        return this.isConnected;
    }
    
    /**
     * 获取当前小时开盘价
     */
    getHourlyOpen(): number {
        return this.hourlyOpen;
    }
}
