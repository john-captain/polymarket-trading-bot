# Tech Stack & Build System

## Frontend
- **Framework**: Next.js 15 (App Router with RSC support)
- **UI Library**: React 18
- **Styling**: TailwindCSS 3.x with CSS variables for theming
- **Component Library**: shadcn/ui (Radix UI primitives, "new-york" style)
- **State Management**: Zustand (client state) + TanStack React Query (server state)
- **Icons**: Lucide React

## Backend
- **API**: Next.js API Routes (RESTful)
- **Database**: MySQL with mysql2/promise driver
- **Blockchain**: Polygon network via ethers.js v5

## External Integrations
| Service | URL | Purpose |
|---------|-----|---------|
| Polygon RPC | polygon-rpc.com (+ fallbacks) | Balance queries, transactions |
| CLOB API | clob.polymarket.com | Order book, order placement |
| Gamma API | gamma-api.polymarket.com | Market discovery |

## Key Dependencies
- `@polymarket/clob-client` - Polymarket CLOB client
- `@ethersproject/wallet` - Ethereum wallet operations
- `mysql2` - MySQL database driver
- `axios` - HTTP client with proxy support
- `p-queue` - Rate limiting for API calls
- `ws` - WebSocket for real-time data

## Common Commands

```bash
# Development
npm run dev              # Start dev server (http://localhost:3000)

# Production
npm run build            # Build for production
npm run start            # Start production server

# Utilities
npm run gen-creds        # Generate CLOB API credentials
npm run check-balance    # Check wallet USDC/MATIC balance
npm run lint             # Run ESLint

# Server scripts (run with ts-node)
npx ts-node server/arbitrage_bot.ts    # Run arbitrage bot directly
npx ts-node server/check_balance.ts    # Check balances
```

## Environment Variables
Key configuration in `.env`:
```
PRIVATE_KEY=0x...           # Polygon wallet private key
ARB_MIN_SPREAD=1.0          # Minimum spread % for arbitrage
ARB_MIN_PROFIT=0.02         # Minimum profit threshold ($)
ARB_TRADE_AMOUNT=10.0       # Trade amount per side ($)
ARB_SCAN_INTERVAL=2000      # Scan interval (ms)
DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  # MySQL config
HTTP_PROXY / SOCKS_PROXY    # Optional proxy configuration
```

## TypeScript Configuration
- Target: ES2017
- Module: ESNext with bundler resolution
- Strict mode enabled
- Path alias: `@/*` → `./src/*`
- Server folder excluded from Next.js compilation (standalone scripts)
