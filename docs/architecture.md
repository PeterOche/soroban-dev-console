# Architecture Documentation

## System Overview

Soroban DevConsole is a monorepo-based web application that provides a comprehensive development environment for Soroban smart contracts. The system consists of a Next.js frontend, NestJS backend, and Soroban test contracts.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Next.js 15   │  │  Zustand     │  │  Wallet Adapters     │  │
│  │  Frontend     │  │  State Store │  │  (Freighter, Albedo) │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼──────────────┘
          │                 │                      │
          │ HTTP/WebSocket  │ LocalStorage         │ Extension API
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Backend (NestJS)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Workspace   │  │  RPC Proxy   │  │  Share Link          │  │
│  │  Module      │  │  Module      │  │  Module              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
│         │                 │                      │              │
│  ┌──────┴─────────────────┴──────────────────────┴──────────┐  │
│  │              Cross-Cutting Concerns                       │  │
│  │  • Authentication (Owner-Key Guard)                      │  │
│  │  • Correlation ID Tracing                                │  │
│  │  • Audit Logging                                         │  │
│  │  • Rate Limiting                                         │  │
│  │  • Error Handling                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Prisma ORM
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SQLite Database                           │
│  • Workspaces        • Contracts      • Share Links             │
│  • Saved Calls       • Artifacts      • Audit Logs              │
└─────────────────────────────────────────────────────────────────┘

                             Also:
                             
┌─────────────────────────────────────────────────────────────────┐
│                    Soroban RPC Endpoints                         │
│  • Mainnet    • Testnet    • Futurenet    • Local               │
│  (proxied through API with caching and failover)                │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Web Frontend (apps/web)

#### Technology Stack
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + Shadcn/ui components
- **State Management**: Zustand with persist middleware
- **Build Tool**: Next.js built-in (Webpack/Turbopack)

#### Key Modules

**Pages (`app/`)**
- `/` - Home dashboard
- `/account` - Account management
- `/contracts` - Contract explorer
- `/deploy` - Contract deployment
- `/settings` - User settings
- `/tools/*` - Developer tools
- `/share/[token]` - Public share link viewer

**State Stores (`store/`)**
- `useWorkspaceStore` - Workspace state with schema versioning
- `useContractStore` - Contract metadata and ABI
- `useSavedCallsStore` - Saved RPC interactions
- `useArtifactStore` - WASM and XDR artifacts
- `schema-version.ts` - Version constants and migration logic

**API Clients (`lib/api/`)**
- `workspaces.ts` - Workspace CRUD operations
- `rpc-gateway.ts` - RPC call proxying
- `runtime-config.ts` - Configuration management

**Key Features**
- Schema versioning with automatic migration
- Correlation ID generation for request tracing
- Wallet integration via Stellar wallets
- Local state persistence with version control

### 2. API Backend (apps/api)

#### Technology Stack
- **Framework**: NestJS (modular architecture)
- **Language**: TypeScript
- **Database**: SQLite with Prisma ORM
- **Validation**: class-validator + class-transformer
- **Error Handling**: Global filters and interceptors

#### Module Architecture

**Workspace Module**
```
workspaces/
├── workspaces.controller.ts  # REST endpoints
├── workspaces.service.ts     # Business logic
├── workspaces.repository.ts  # Data access
└── workspace.dto.ts          # Data transfer objects
```

Responsibilities:
- CRUD operations for workspaces
- Owner-key authentication
- Workspace import/export
- Share link creation

**RPC Module**
```
rpc/
├── rpc.controller.ts         # RPC proxy endpoint
├── rpc.service.ts            # Proxy logic
├── rpc-cache.service.ts      # Response caching
├── rpc-failover.service.ts   # Endpoint failover
├── rpc-rate-limit.guard.ts   # Rate limiting
├── rpc-method-policy.ts      # Method allowlisting
└── rpc.module.ts
```

Responsibilities:
- Proxy Soroban RPC calls
- Cache idempotent responses
- Failover across multiple endpoints
- Rate limit by IP
- Enforce method policies
- Propagate correlation IDs

**Shares Module**
```
shares/
├── shares.controller.ts      # Share link endpoints
├── shares.service.ts         # Share logic
├── shares.repository.ts      # Data access
└── shares.module.ts
```

Responsibilities:
- Create share links with snapshots
- Public resolution by token
- Revoke shares
- Cleanup expired shares
- Validate snapshot size/depth

**Cross-Cutting Concerns**

**Authentication (`auth/`)**
- `owner-key.guard.ts` - Bearer token validation
- Length and pattern checks
- Attached to mutation routes only

**Request Context (`lib/`)**
- `request-context.ts` - AsyncLocalStorage for correlation IDs
- `correlation.interceptor.ts` - Extract/generate x-request-id
- Propagated to logs, events, and upstream calls

**Audit Logging**
- `audit.service.ts` - Durable audit trail
- Records all workspace/share mutations
- Includes actor, action, resource, metadata

**Error Handling**
- `api-error.filter.ts` - Global exception filter
- `db-error.mapper.ts` - Database error mapping
- `api-response.interceptor.ts` - Response envelope

### 3. Smart Contracts (contracts/)

Test fixtures for development and testing:

| Contract | Purpose |
|----------|---------|
| `counter-fixture` | Simple stateful counter |
| `event-fixture` | Event emission patterns |
| `auth-tester` | Authentication testing |
| `token-fixture` | Token contract examples |
| `failure-fixture` | Error handling scenarios |
| `error-trigger` | Specific error conditions |
| `source-registry` | Source code registration |
| `types-tester` | Complex type handling |

### 4. Shared Packages

**api-contracts**
- TypeScript type definitions for API responses
- Shared between frontend and backend
- Ensures type safety across the boundary

**ui**
- Reusable UI components
- Shared across potential future apps

## Data Flow

### Workspace Operations

```
1. User creates workspace in browser
   ↓
2. Frontend generates correlation ID
   ↓
3. POST /api/workspaces with x-owner-key and x-request-id
   ↓
4. CorrelationInterceptor extracts/generates ID
   ↓
5. OwnerKeyGuard validates owner key
   ↓
6. WorkspacesService creates workspace in DB
   ↓
7. AuditService logs the mutation
   ↓
8. Response includes x-request-id header
   ↓
9. Frontend updates Zustand store
   ↓
10. State persisted to localStorage
```

### RPC Proxy Flow

```
1. User triggers contract call
   ↓
2. Frontend generates correlation ID
   ↓
3. POST /api/rpc/:network with JSON-RPC payload
   ↓
4. CorrelationInterceptor sets context
   ↓
5. RpcRateLimitGuard checks rate limit
   ↓
6. RpcService validates method policy
   ↓
7. RpcCacheService checks for cached response
   ↓ (cache miss)
8. RpcFailoverService selects endpoint
   ↓
9. fetchUpstream() with x-request-id header
   ↓
10. Response cached if idempotent
    ↓
11. Events emitted with correlation ID
    ↓
12. Response returned to frontend
```

### Share Link Flow

```
1. Owner creates share link
   ↓
2. Snapshot JSON validated (size, depth)
   ↓
3. Expiration validated (max 1 year)
   ↓
4. Token generated (24 random bytes, base64url)
   ↓
5. Share record created in DB
   ↓
6. Audit log entry created
   ↓
   ... (later)
   ↓
7. User accesses /share/[token]
   ↓
8. Public endpoint resolves token
   ↓
9. Checks: exists? revoked? expired?
   ↓
10. Returns snapshot (no internal IDs or ownerKey)
```

## Security Architecture

### Authentication Model

**Owner-Key Authentication**
- Bearer token style (no sessions/JWTs)
- Required for workspace mutations
- Not required for public share access
- Minimum 8 chars, maximum 256
- Forbidden patterns rejected
- Stored in localStorage (frontend)

**Recommendations for Production**
- Implement Stellar signature authentication
- Add JWT with short expiration
- Enable key rotation
- Increase rate limiting strictness

### Input Validation

**All Endpoints**
- class-validator DTOs
- Whitelist transformation
- Type coercion and validation

**Share Snapshots**
- Maximum size: 500KB
- Maximum depth: 10 levels
- Expiration: 1 year max
- Token: cryptographically random

**RPC Payloads**
- JSON-RPC schema validation
- Method allowlisting
- Batch size limits (25 max)
- Payload size limits (50KB max)

### CORS & Headers

**CORS Policy**
- Strict origin matching
- x-owner-key NOT in allowedHeaders (security)
- x-request-id allowed for tracing
- Credentials enabled

**Security Headers**
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- X-XSS-Protection: 0
- Referrer-Policy: strict-origin-when-cross-origin

## Deployment Architecture

### Development

```
npm run dev
  ↓
Turborepo runs concurrently:
  - apps/api (NestJS, port 4000)
  - apps/web (Next.js, port 3000)
```

### Production

**Frontend**
- Deploy to Vercel, Netlify, or similar
- Environment: NEXT_PUBLIC_API_URL
- Static + SSR pages

**Backend**
- Deploy to any Node.js host
- Environment: DATABASE_URL, RPC URLs, etc.
- SQLite file or external database
- Horizontal scaling via stateless design

**Database**
- SQLite for development/small deployments
- PostgreSQL for production (via Prisma)
- Migrations via Prisma CLI

## Monitoring & Observability

### Correlation ID Tracing

Every request receives a correlation ID (x-request-id):
- Generated by frontend or backend
- Propagated through all services
- Included in all logs
- Passed to upstream RPC calls
- Returned in response headers
- Surfaced in error messages

### Audit Logging

All mutations recorded:
- Workspace CRUD
- Share link operations
- Includes: actor, action, resource, timestamp, metadata

### Event System

Domain events emitted for:
- Workspace operations
- Share link operations
- RPC proxy activity
- Cache hits/misses
- Upstream errors

Events can be subscribed to for:
- Analytics
- Monitoring
- Debugging
- Audit trails

## Schema Evolution

### Version Management

Three version constants kept in sync:
- `STORE_SCHEMA_VERSION` - Zustand persist version
- `SERIALIZER_VERSION` - Export/import format
- `API_SNAPSHOT_VERSION` - API snapshot version

### Migration Strategy

1. Bump version constants in `schema-version.ts`
2. Implement migration function in store
3. Update serializer validation
4. Add test fixtures for old versions
5. Run migration verification suite

### Migration Verification

Test suite validates:
- Browser state migration (v1 → v2)
- Serializer compatibility
- API seed data integrity
- Round-trip export/import

See `scripts/verify-migrations.sh` for automation.

## Future Considerations

### Scalability
- Switch SQLite to PostgreSQL for production
- Add Redis for distributed caching
- Implement WebSocket for real-time updates
- Consider GraphQL for complex queries

### Authentication
- Stellar signature-based auth
- JWT with refresh tokens
- OAuth2 integration
- Multi-user workspaces

### Performance
- Response compression
- CDN for static assets
- Database connection pooling
- Query optimization

### Developer Experience
- OpenAPI/Swagger documentation
- Postman collection
- SDK for programmatic access
- CLI tool for automation
