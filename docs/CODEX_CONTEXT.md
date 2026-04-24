# Soroban DevConsole - Project Context

## Overview

Soroban DevConsole is a comprehensive web-based developer toolkit for building, testing, and debugging Soroban smart contracts on Stellar. It provides an intuitive interface that bridges the gap between CLI-heavy workflows and visual debugging tools.

## Architecture

### Monorepo Structure

The project uses Turborepo for monorepo management with the following structure:

```
soroban-dev-console/
├── apps/
│   ├── web/              # Next.js 15 frontend
│   └── api/              # NestJS backend
├── contracts/            # Soroban test fixtures (Rust)
├── packages/             # Shared packages
│   ├── api-contracts/    # TypeScript type definitions
│   └── ui/               # Shared UI components
├── docs/                 # Documentation
└── scripts/              # Build and deployment utilities
```

### Applications

#### Web Frontend (apps/web)
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn/ui
- **State**: Zustand with schema versioning
- **Key Features**:
  - Workspace management UI
  - Contract explorer and interaction forms
  - Transaction monitoring
  - Wallet integration (Freighter, Albedo)
  - Network switching
  - Share link viewing

#### API Backend (apps/api)
- **Framework**: NestJS
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Key Features**:
  - Workspace CRUD operations
  - RPC proxy with caching and failover
  - Share link management
  - Audit logging
  - Owner-key authentication
  - Correlation ID tracing

### Smart Contracts (contracts/)

Test fixtures and examples for development:
- `counter-fixture/` - Simple counter contract
- `event-fixture/` - Event emission testing
- `auth-tester/` - Authentication patterns
- `token-fixture/` - Token contract examples
- `failure-fixture/` - Error handling tests
- And more...

## Key Workflows

### Workspace Management

Workspaces are isolated development environments that contain:
- Collections of contracts
- Saved interactions/calls
- Artifacts (WASM files, decoded XDR)
- Network selection
- Share links

**Data Flow**:
```
Browser (Zustand) ←→ API (Prisma/SQLite) ←→ Share Links
```

### RPC Proxy

The backend proxies Soroban RPC calls with:
- Method allowlisting
- Request/response caching
- Multi-endpoint failover
- Rate limiting
- Correlation ID propagation

**Data Flow**:
```
Frontend ←→ API Gateway ←→ RPC Endpoints (with failover)
```

### Share Links

Read-only snapshots of workspace state for collaboration:
- Created by workspace owner
- Optional expiration (max 1 year)
- Token-based access (no authentication required)
- Snapshot JSON validated for size and depth

## Security Model

### Authentication
- Owner-key based (bearer token style)
- Minimum 8 characters, maximum 256
- Forbidden patterns rejected
- Applied to workspace mutations only

### Share Links
- Public read-only access via token
- Owner can revoke at any time
- Expiration dates enforced
- Snapshot validation prevents JSON bombs

### CORS & Headers
- Restrictive CORS policy
- x-owner-key not advertised in preflight
- Security headers on all responses
- Input validation on all endpoints

## State Management

### Browser State (Zustand)
- Persisted to localStorage
- Schema versioning (STORE_SCHEMA_VERSION)
- Migration support for version upgrades
- Excludes sensitive data (wallet keys)

### API State (Prisma/SQLite)
- Workspace data
- Contract metadata
- Saved interactions
- Share links
- Audit logs

### Serialization
- Versioned export/import format (SERIALIZER_VERSION)
- Cross-version migration support
- Validation on import
- Round-trip integrity checks

## Development Practices

### Code Quality
- TypeScript strict mode
- Prettier for formatting
- ESLint for code quality
- Conventional commits

### Testing
- Unit tests for business logic
- Integration tests for API endpoints
- Migration verification tests
- Schema compatibility tests

### Database Migrations
- Prisma migrations in `apps/api/prisma/migrations/`
- Seed data in `apps/api/prisma/seed.ts`
- Schema version constants in `apps/web/store/schema-version.ts`

## Runtime Configuration

### Environment Variables
- API: `apps/api/.env` (see `.env.example`)
- Web: `apps/web/.env.local` (see `.env.example`)

### Development Mode
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run start
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

Key areas for contribution:
- Frontend UI/UX improvements
- Backend API enhancements
- Smart contract fixtures
- Documentation
- Tests

## Resources

- [Stellar Developers](https://developers.stellar.org/)
- [Soroban Documentation](https://soroban.stellar.org/)
- [Stellar SDK](https://github.com/stellar/js-stellar-sdk)
- [Stellar Discord](https://discord.gg/stellardev)
