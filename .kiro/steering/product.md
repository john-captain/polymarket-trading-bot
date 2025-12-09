# Product Overview

Polymarket Trading Bot is an automated arbitrage trading system for the Polymarket prediction market platform.

## Core Purpose
Detect and execute arbitrage opportunities on Polymarket by exploiting price inefficiencies when the sum of outcome prices deviates from 1.

## Key Features
- **Arbitrage Scanning**: Automatically scans all active markets for arbitrage opportunities
- **Real-time Monitoring**: Price monitoring, order book data, and market analysis
- **One-click Execution**: Execute trades when opportunities are found
- **Trade History**: Complete transaction records and profit/loss statistics
- **Position Management**: View current holdings and unrealized P&L
- **Strategy Configuration**: Configurable arbitrage parameters and risk controls

## Arbitrage Strategies
Based on academic paper "Arbitrage Behavior in Polymarket Prediction Markets":

| Type | Condition | Action | Profit Formula |
|------|-----------|--------|----------------|
| LONG | Price sum < 1 | Buy all outcomes | `investment × (1 - priceSum) / priceSum` |
| SHORT | Price sum > 1 | Sell all outcomes | `investment × (priceSum - 1)` |

## Target Users
Traders looking to profit from prediction market inefficiencies on Polygon blockchain.

## Production URL
http://polymarket.wukongbc.com/
