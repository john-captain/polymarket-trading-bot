/**
 * 查找并自动检测 Polymarket 市场
 */

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

export interface Market {
    slug: string;
    question: string;
    conditionId: string;
    tokens: Token[];
    url: string;
}

export interface Token {
    tokenId: string;
    outcome: string;
    price?: number;
}

export class MarketFinder {
    private gammaApiUrl: string;

    constructor(gammaApiUrl?: string) {
        this.gammaApiUrl = gammaApiUrl || 'https://gamma-api.polymarket.com';
    }

    /**
     * 根据当前时间生成比特币市场 URL
     */
    generateBitcoinMarketUrl(): { url: string; slug: string } {
        const now = new Date();
        
        // 转换为东部时间 (UTC-5 为 EST，UTC-4 为 EDT)
        const month = now.getUTCMonth() + 1;
        const isDST = month > 3 && month < 11;
        const etOffset = isDST ? -4 : -5;
        
        const etDate = new Date(now.getTime() + etOffset * 60 * 60 * 1000);
        
        const monthName = etDate.toLocaleString('en-US', { month: 'long' }).toLowerCase();
        const day = etDate.getUTCDate();
        const hour = etDate.getUTCHours();
        
        // 将小时转换为12小时制
        let timeStr: string;
        if (hour === 0) {
            timeStr = '12am';
        } else if (hour < 12) {
            timeStr = `${hour}am`;
        } else if (hour === 12) {
            timeStr = '12pm';
        } else {
            timeStr = `${hour - 12}pm`;
        }
        
        const slug = `bitcoin-up-or-down-${monthName}-${day}-${timeStr}-et`;
        const url = `https://polymarket.com/event/${slug}`;
        
        return { url, slug };
    }

    /**
     * 通过 slug 获取市场数据
     */
    async fetchMarketBySlug(slug: string): Promise<Market | null> {
        try {
            const response = await axios.get(`${this.gammaApiUrl}/markets`, {
                params: { slug }
            });

            const data = response.data;
            let market: any;

            if (Array.isArray(data) && data.length > 0) {
                market = data[0];
            } else if (data.data && Array.isArray(data.data) && data.data.length > 0) {
                market = data.data[0];
            } else if (data.results && Array.isArray(data.results) && data.results.length > 0) {
                market = data.results[0];
            } else if (typeof data === 'object') {
                market = data;
            }

            if (!market) {
                return null;
            }

            return this.parseMarket(market);
            
        } catch (error) {
            console.error(`❌ 获取市场时出错:`, error);
            return null;
        }
    }

    /**
     * 将市场数据解析为标准格式
     */
    private parseMarket(marketData: any): Market {
        const tokens: Token[] = [];

        if (marketData.tokens && Array.isArray(marketData.tokens)) {
            for (const token of marketData.tokens) {
                tokens.push({
                    tokenId: token.token_id || token.tokenId,
                    outcome: token.outcome,
                    price: token.price ? parseFloat(token.price) : undefined
                });
            }
        }

        // 识别 UP 和 DOWN 代币
        const upToken = tokens.find(t => 
            t.outcome.toLowerCase().includes('up') || 
            t.outcome.toLowerCase().includes('yes') ||
            t.outcome.toLowerCase().includes('higher')
        );
        
        const downToken = tokens.find(t => 
            t.outcome.toLowerCase().includes('down') || 
            t.outcome.toLowerCase().includes('no') ||
            t.outcome.toLowerCase().includes('lower')
        );

        return {
            slug: marketData.slug,
            question: marketData.question,
            conditionId: marketData.condition_id || marketData.conditionId,
            tokens: [upToken, downToken].filter(Boolean) as Token[],
            url: `https://polymarket.com/event/${marketData.slug}`
        };
    }

    /**
     * 查找当前比特币市场
     */
    async findCurrentBitcoinMarket(): Promise<Market | null> {
        const { slug } = this.generateBitcoinMarketUrl();
        console.log(`🔍 搜索比特币市场: ${slug}`);
        
        const market = await this.fetchMarketBySlug(slug);
        
        if (market) {
            console.log('✅ 已找到市场！');
            this.displayMarket(market);
        } else {
            console.log('❌ 未找到市场');
        }
        
        return market;
    }

    /**
     * 搜索活跃市场
     */
    async searchActiveMarkets(query: string = 'bitcoin'): Promise<Market[]> {
        try {
            const response = await axios.get(`${this.gammaApiUrl}/markets`, {
                params: {
                    active: true,
                    closed: false,
                    limit: 50
                }
            });

            const markets = response.data.data || response.data || [];
            const filtered = markets.filter((m: any) => 
                m.question.toLowerCase().includes(query.toLowerCase())
            );

            return filtered.map((m: any) => this.parseMarket(m));
            
        } catch (error) {
            console.error(`❌ 搜索市场时出错:`, error);
            return [];
        }
    }

    /**
     * 显示市场信息
     */
    displayMarket(market: Market): void {
        console.log('='.repeat(60));
        console.log(`问题: ${market.question}`);
        console.log(`URL: ${market.url}`);
        console.log(`条件 ID: ${market.conditionId}`);
        console.log('-'.repeat(60));
        
        for (const token of market.tokens) {
            console.log(`${token.outcome}:`);
            console.log(`  代币 ID: ${token.tokenId}`);
            if (token.price) {
                console.log(`  价格: $${token.price.toFixed(4)} (${(token.price * 100).toFixed(1)}%)`);
            }
        }
        
        console.log('='.repeat(60));
    }
}

// 示例用法
if (require.main === module) {
    (async () => {
        try {
            const finder = new MarketFinder();
            
            // 查找当前比特币市场
            const market = await finder.findCurrentBitcoinMarket();
            
            if (market) {
                console.log('\n📊 市场详情加载成功！');
            }
            
        } catch (error) {
            console.error('错误:', error);
            process.exit(1);
        }
    })();
}

