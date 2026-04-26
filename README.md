# Soroban DevConsole

> A comprehensive web-based developer toolkit for building, testing, and debugging Soroban smart contracts on Stellar.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

Soroban DevConsole provides an intuitive web interface for Soroban smart contract development, bridging the gap between CLI-heavy workflows and visual debugging tools. It features workspace management, contract interaction, RPC proxying, and shareable state snapshots.

## Architecture

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Web Frontend  │◄───────►│   API Backend    │◄───────►│  Soroban RPC    │
│   (Next.js 15)  │         │   (NestJS)       │         │  Endpoints      │
└─────────────────┘         └──────────────────┘         └─────────────────┘
          │                          │
          │                          │
          ▼                          ▼
┌─────────────────┐         ┌──────────────────┐
│  Browser Store  │         │   SQLite DB      │
│  (Zustand)      │         │   (Prisma)       │
└─────────────────┘         └──────────────────┘
```

### Key Components

- **Workspace Management**: Isolated development environments with contract collections
- **RPC Proxy**: Backend-mediated access to Soroban RPC with caching, failover, and rate limiting
- **Share Links**: Read-only snapshots of workspace state for collaboration
- **Contract Explorer**: Visual interface for contract interaction and state inspection
- **Transaction Monitor**: Real-time transaction tracking and debugging

## Tech Stack

### Frontend (apps/web)
- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, Shadcn/ui components
- **State Management**: Zustand with schema versioning
- **Blockchain**: Stellar SDK, Soroban SDK

### Backend (apps/api)
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Features**: RPC proxy, workspace CRUD, share links, audit logging

### Smart Contracts (contracts/)
- **Language**: Rust
- **Framework**: Soroban SDK
- **Purpose**: Test fixtures and examples

### Monorepo Tooling
- **Build System**: Turborepo
- **Package Manager**: npm
- **Code Quality**: Prettier, ESLint

## Project Structure

```
soroban-dev-console/
├── apps/
│   ├── web/                  # Next.js frontend application
│   │   ├── app/              # Next.js App Router pages
│   │   ├── components/       # React components
│   │   ├── lib/              # Utilities and API clients
│   │   └── store/            # Zustand state stores
│   └── api/                  # NestJS backend application
│       ├── src/
│       │   ├── modules/      # Feature modules (workspaces, rpc, shares)
│       │   ├── lib/          # Shared utilities
│       │   └── auth/         # Authentication guards
│       └── prisma/           # Database schema and migrations
├── contracts/                # Soroban smart contract fixtures
│   ├── counter-fixture/
│   ├── event-fixture/
│   └── ...
├── packages/                 # Shared packages
│   ├── api-contracts/        # TypeScript API type definitions
│   └── ui/                   # Shared UI components
├── docs/                     # Documentation
└── scripts/                  # Build and deployment scripts
```

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm 9 or later
- Git

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Ibinola/soroban-dev-console.git
   cd soroban-dev-console
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   
   For the API:
   ```bash
   cp apps/api/.env.example apps/api/.env
   ```
   
   For the Web app:
   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

4. **Initialize the database**:
   ```bash
   cd apps/api
   npx prisma generate
   npx prisma db push
   npx prisma db seed
   cd ../..
   ```

5. **Start development servers**:
   ```bash
   npm run dev
   ```
   
   This starts both the API (port 4000) and web app (port 3000) concurrently.

6. **Open the application**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## Development Workflow

### Running Tests

```bash
# Run all tests
npm test

# Run API tests only
npm run test --filter=api

# Run web tests only
npm run test --filter=web
```

### Code Quality

```bash
# Lint and format
npm run lint
npm run format

# Type checking
npm run type-check
```

### Database Migrations

```bash
cd apps/api

# Create a new migration
npx prisma migrate dev --name <description>

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset
```

## Environment Configuration

### API Environment (apps/api/.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `4000` |
| `WEB_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |
| `DATABASE_URL` | SQLite database path | `file:./dev.db` |
| `SOROBAN_RPC_TESTNET_URL` | Testnet RPC endpoint | (required) |
| `SOROBAN_RPC_MAINNET_URL` | Mainnet RPC endpoint | (optional) |
| `SOROBAN_RPC_FUTURENET_URL` | Futurenet RPC endpoint | (optional) |
| `SOROBAN_RPC_LOCAL_URL` | Local network RPC endpoint | (optional) |

| `NEXT_PUBLIC_PASSPHRASE_*` | Network passphrases | (see .env.example) |

### Runtime Defaults (Centralized)

DEVOPS-025: The project uses a centralized source of truth for all runtime ports and local URLs to prevent drift.

- **Canonical Source**: [packages/api-contracts/src/runtime-defaults.ts](file:///Users/mustang/Desktop/soroban-dev-console/packages/api-contracts/src/runtime-defaults.ts)
- **Validation**: Run `npm run check-drift` to verify that all documentation and `.env.example` files are aligned with these defaults. Run `npm run check-integrity` to verify lockfile and workspace dependency consistency.

| Service | Default Port | Default Local URL |
|---------|--------------|-------------------|
| API Backend | `4000` | `http://localhost:4000` |
| Web App | `3000` | `http://localhost:3000` |
| Horizon | `8000` | `http://localhost:8000` |

## Key Features

### Workspace Management
- Create isolated development environments
- Import/export workspace state
- Version-controlled schema migrations
- Share workspaces via read-only links

### RPC Proxy
- Backend-mediated RPC access with caching
- Automatic failover across multiple endpoints
- Rate limiting and method policies
- Correlation ID tracing for debugging

### Security
- Owner-key based authentication (bearer token)
- CORS protection with restrictive header policies
- Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- Input validation and sanitization
- Audit logging for all mutations

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Quick Start for Contributors

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit with descriptive messages
6. Push and open a Pull Request

## Resources

- [Stellar Developers Documentation](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Stellar Discord](https://discord.gg/stellardev)

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Maintainer

- GitHub: [@Ibinola](https://github.com/Ibinola)
- Project: [Soroban DevConsole](https://github.com/Ibinola/soroban-dev-console)

## Support

- **Issues**: [GitHub Issues](https://github.com/Ibinola/soroban-dev-console/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Ibinola/soroban-dev-console/discussions)
- **Discord**: Join the Stellar Discord for real-time chat

---

**⭐ Star this repo** if you're excited about making Soroban development more accessible!
