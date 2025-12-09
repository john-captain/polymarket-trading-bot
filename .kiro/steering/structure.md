# Project Structure

```
polymarket-trading-bot/
├── src/                          # Next.js application source
│   ├── app/                      # App Router pages and API
│   │   ├── (dashboard)/          # Route group - pages with sidebar layout
│   │   │   ├── overview/         # Dashboard overview
│   │   │   ├── markets/          # Market scanning & monitoring
│   │   │   ├── strategies/       # Strategy configuration
│   │   │   ├── trades/           # Trade history & positions
│   │   │   └── settings/         # System settings
│   │   ├── api/                  # API Routes
│   │   │   ├── arbitrage/        # Arbitrage endpoints (scan, execute, stats)
│   │   │   ├── balance/          # Wallet balance
│   │   │   ├── bot/              # Bot control (start/stop/status)
│   │   │   ├── markets/          # Market data
│   │   │   ├── opportunities/    # Arbitrage opportunities
│   │   │   ├── positions/        # Position management
│   │   │   ├── queues/           # Queue system control
│   │   │   ├── strategies/       # Strategy management
│   │   │   └── trades/           # Trade records
│   │   ├── layout.tsx            # Root layout
│   │   ├── page.tsx              # Home page
│   │   └── globals.css           # Global styles & CSS variables
│   ├── components/
│   │   ├── layout/               # Layout components (Sidebar, Header)
│   │   ├── ui/                   # shadcn/ui components
│   │   └── *.tsx                 # Feature components
│   ├── lib/
│   │   ├── api-client/           # API client utilities
│   │   ├── queue/                # Queue system for rate limiting
│   │   ├── strategies/           # Trading strategy implementations
│   │   ├── arbitrage-scanner.ts  # Core arbitrage scanning logic
│   │   ├── bot-state.ts          # Bot state management
│   │   ├── database.ts           # MySQL operations
│   │   ├── trade-executor.ts     # Trade execution logic
│   │   └── utils.ts              # Utility functions (cn, formatters)
│   ├── types/
│   │   └── index.ts              # TypeScript type definitions
│   └── hooks/
│       └── use-toast.ts          # Toast notification hook
├── server/                       # Standalone TypeScript scripts
│   ├── arbitrage_bot.ts          # Main arbitrage bot (CLI)
│   ├── balance_checker.ts        # Balance checking utility
│   ├── generate_credentials.ts   # CLOB credential generator
│   ├── db.ts                     # Database utilities for scripts
│   └── *.ts                      # Other utility scripts
├── scripts/                      # Database & utility scripts
├── public/                       # Static assets
├── README/                       # Documentation files
└── docs/                         # Additional documentation
```

## Key Architectural Patterns

### API Routes
- Located in `src/app/api/[endpoint]/route.ts`
- Use Next.js Route Handlers with `GET`, `POST` exports
- Return `NextResponse.json()` with `{ success, data?, error? }` shape

### Database Layer
- Connection pooling via `mysql2/promise`
- All DB operations in `src/lib/database.ts`
- Uses parameterized queries for security

### State Management
- Server state: React Query for data fetching/caching
- Client state: Zustand stores in `src/lib/bot-state.ts`
- Bot settings persisted in Zustand with localStorage

### Component Organization
- UI primitives in `src/components/ui/` (shadcn/ui)
- Layout components in `src/components/layout/`
- Feature components at `src/components/` root

### Server Scripts
- Standalone scripts in `server/` folder
- Run with `npx ts-node server/[script].ts`
- Excluded from Next.js build (see tsconfig.json)
