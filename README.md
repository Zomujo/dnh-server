# GIZ-DNH API

Backend API for the **GIZ-AYA Diabetes and Hypertension (DNH) Application** — a healthcare platform serving patients with chronic conditions (diabetes, hypertension) and the clinical personnel who manage them.

Built with **NestJS 11**, **MongoDB/Mongoose**, **Firebase**, **Redis**, and a **LangGraph-powered AI layer** running on Google Gemini.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Module Breakdown](#module-breakdown)
  - [AppModule](#appmodule)
  - [CommonModule](#commonmodule)
  - [CoreModule](#coremodule)
  - [FeaturesModule](#featuresmodule)
- [AI Agent System](#ai-agent-system)
- [Auth Flow](#auth-flow)
- [Response Shape](#response-shape)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Running the Server](#running-the-server)
- [API Documentation](#api-documentation)
- [Running Tests](#running-tests)
- [Code Quality](#code-quality)
- [Project Conventions](#project-conventions)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 (TypeScript) |
| Primary DB | MongoDB via Mongoose (`@nestjs/mongoose`) |
| Auth | Firebase Admin SDK (token verification) + JWT (personnel) |
| Caching | Redis via `@nestjs/cache-manager` + `@keyv/redis` |
| Queues | BullMQ (backed by same Redis instance) |
| AI / LLM | Google Gemini (`@langchain/google-genai`) via LangChain/LangGraph |
| Vector DB | Qdrant (`@qdrant/js-client-rest`) |
| AI Memory | LangGraph `MongoDBSaver` checkpointer |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| File Storage | Firebase Storage |
| Observability | BetterStack (Logtail) via `@logtail/node` |
| Linter/Formatter | Biome |
| Test Runner | Vitest + Supertest |
| Package Manager | pnpm |

---

## Architecture Overview

```
AppModule
├── CommonModule      – shared interceptors, decorators, DTOs, response utils
├── CoreModule        – infrastructure (auth, db, caching, firebase, logging)
│   ├── AuthModule
│   ├── DatabaseModule
│   ├── CachingModule
│   ├── FirebaseModule
│   └── LoggingModule
└── FeaturesModule    – domain business logic
    ├── ClientModule       (patient-facing: AI chat, vitals, medications, adherence)
    ├── DoctorsModule      (clinician-facing: planner, AI-assisted plans)
    ├── PatientsModule
    ├── ChronicConditionsModule
    ├── MedicationsModule
    ├── AdherencesModule
    ├── VitalHistoriesModule
    ├── ConcernsModule
    ├── NotificationsModule
    ├── PharmaciesModule
    └── DhVectorsModule    (Qdrant vector store management)
```

All routes are prefixed `/api/v1`. The root `GET /` is excluded from this prefix and serves as a health-check endpoint.

---

## Module Breakdown

### AppModule

Entry point. Imports `CommonModule`, `CoreModule`, and `FeaturesModule`. No business logic lives here.

### CommonModule

Shared utilities consumed across the entire app:

- **Interceptors** — `HandlerWrappers` (`HandleSuccess`, `HandleCreate`, `HandleUpdate`, `HandleSuccessNull`) that shape every response into a consistent `ApiSuccessResponseDto` envelope.
- **Decorators** — `@Authorize(UserType)`, `@Roles(PersonnelRoles[])`, `@GetUser()`, `@GetTherapist()`, `@CustomApiResponse()`, `@PaginatedSuccess()`.
- **DTOs** — `PaginationDto`, `BaseDto`, `SuccessDto`, `ErrorDto`.
- **Validators** — `@IsGreaterThan()` custom class-validator decorator, `MongoIdPipe`.
- **Factories** — `PaginationFilterFactory`, `CustomLoggerFactory`.
- **Utilities** — `CodeGeneratorHelper`, `WeekDeterminantHelper`, `IanaTimezonesHelper`, `ZipHelper`, Redis-backed `CheckpointerUtils`.

### CoreModule

Infrastructure-only module. All sub-modules here are `@Global()` or re-exported globally.

#### AuthModule

Registers two `APP_GUARD` providers that intercept **every** incoming request:

1. **`AuthGuard`** — reads the `@Authorize(UserType)` decorator. If present, extracts the `Bearer` token and routes it to the correct verifier:
   - `UserType.DH_CLIENTS` / `UserType.DEV` → Firebase `verifyIdToken`
   - `UserType.CHRONIC_CARE` → JWT `verifyAsync` (local personnel token)

   After successful verification the decoded payload is attached to `request.user`. For `DEV`-audience tokens it also populates a short-lived Redis user cache (50-minute TTL).

2. **`RolesGuard`** — reads `@Roles(PersonnelRoles[])`. If present, asserts `request.user.role` is in the allowed list. Only meaningful for `CHRONIC_CARE` routes.

The `AuthController` exposes patient signup (creates Firebase user + MongoDB patient record), login, Google OAuth, and an FCM test endpoint.

#### DatabaseModule

Registers the global Mongoose connection using `DB_CONNECTION_STRING` and `DB_NAME`. Every feature module registers its own schemas via `MongooseModule.forFeature()`.

#### CachingModule (`@Global`)

- **Cache** — `@nestjs/cache-manager` backed by Keyv/Redis with a 5-minute default TTL.
- **Queues** — BullMQ `forRoot` connected to the same `REDIS_URL`. Individual feature modules register named queues via `BullModule.registerQueue()`.

Both use the single `REDIS_URL` environment variable.

#### FirebaseModule

Initialises a single Firebase Admin app (`database-app`) from individual `FIREBASE_BASE_*` environment variables. Exposes:

- `firebaseService.auth` — user management & token verification
- `firebaseService.db` — Firestore
- `firebaseService.messaging` — FCM
- `firebaseService.firebaseStorage` — Cloud Storage

The `private_key` value must be stored with escaped `\n` sequences (e.g. `"-----BEGIN PRIVATE KEY-----\n..."`) — the service calls `.replace(/\\n/g, '\n')` before passing it to `firebase-admin`.

#### LoggingModule

`DomainLogger` extends NestJS's `ConsoleLogger`. In non-development environments it additionally forwards `error` and `warn` calls to BetterStack (Logtail) using `LOGTAIL_SOURCE_TOKEN` and `LOGTAIL_HOST`. In development the NestJS default console logger is used and Logtail forwarding is silent.

### FeaturesModule

All domain features. Key modules:

#### ClientModule

The primary patient-facing module. Aggregates data from many sub-modules and exposes a unified `/api/v1/client` surface.

Key endpoints:
- `POST /client/chat` — text chat with the AI health assistant (streamed LangGraph agent)
- `POST /client/chat/audio` — voice chat (accepts `m4a`, `mpeg`, `mp4` audio files)
- `GET /client/patient` — fetch full patient profile
- `GET /client/chronic-conditions` — paginated chronic condition list
- `GET /client/medications` — paginated medication list
- `POST /client/vital-histories/log` — log a new vital sign reading
- `GET /client/vital-histories` — all vital history entries
- `GET /client/vital-histories/trends` / `trends/bp` — charting data
- `GET /client/adherence-patterns` — paginated adherence records
- `GET /client/medication-adherence` — medication adherence summary
- `GET /client/concerns` — paginated patient concerns
- `GET /client/chats` — paginated AI chat message history
- `DELETE /client/chats/:id` — delete a chat message
- `DELETE /client/clean/:userId` — purge all patient data (dev/admin use)

All `Client` routes require `@Authorize(UserType.DH_CLIENTS)`.

#### DoctorsModule

Clinical personnel (clinicians and pharmacy staff). Contains:
- **ChronicCareAuthModule** — personnel registration, password login, and Google OAuth login. Issues JWT tokens with `chronic-care` audience.
- **DoctorsController** — personnel profile management.
- **PlannerModule** — AI-assisted care planning, plan CRUD, and session management.

#### PatientsModule

Manages MongoDB `Patient` documents. Handles patient creation (called by `AuthService.signup`), retrieval, summary generation (AI-powered, event-driven via `@nestjs/event-emitter`), and updates.

#### ChronicConditionsModule / MedicationsModule / AdherencesModule / VitalHistoriesModule / ConcernsModule

Standard CRUD modules managing individual health data domains. Each owns its Mongoose schema and is responsible for registering its models.

#### NotificationsModule

BullMQ-backed notification queue. The `NotificationsConsumer` processes queued FCM push notifications. The `AuguryService` (AI agent — see below) writes to this module to schedule reminders.

#### DhVectorsModule

Manages the Qdrant vector collection `dh_vectors`. On module init (`OnModuleInit`) it ensures the collection and keyword indexes (`userId`, `patient`, `documentType`) exist. Uses `gemini-embedding-001` (3072-dimensional vectors) for embedding and Fuse.js for client-side fuzzy re-ranking of semantic search results.

---

## AI Agent System

The AI layer lives in `src/features/client/ai/` and is built on **LangGraph** with **Google Gemini** (`gemini-2.5-flash` by default, overridable via `GOOGLE_AI_VERSION`).

### LangGraph Conversation Agent (`ClientAIService`)

The core conversational agent uses a `StateGraph` with:
- `llmCall` node — invokes Gemini with the current `ConversationScope` prompt
- `toolNode` — executes tool calls returned by the LLM
- Conditional edge: if the last message has tool calls, route to `toolNode`; otherwise `END`

**Conversation scopes** (`ConversationScope`) represent structured interview stages: `general` → `chronicConditions` → `medications` → `vitalHistory` → `concerns` → `end`. The LLM calls the `changeConversationScope` tool to advance through stages.

**Checkpointing** — conversation state is persisted to MongoDB via `MongoDBSaver`, keyed by `userId`. This provides full multi-turn memory across sessions without re-loading history on every request.

**Message trimming** — before each LLM call, messages are trimmed to 80,000 tokens (strategy: `last`) to stay within context limits.

### Specialist Agents

| Agent | File | Role |
|---|---|---|
| **Archonen** | `archonen/` | Router — analyses incoming messages and decides which downstream agents to invoke |
| **Augury** | `augury/` | Notification scribe — creates or updates scheduled patient notifications (calls `NotificationsService` as a LangChain tool) |
| **Chronicleer** | `chronicleer/` | Generates AI health insights and summaries from conversation state |
| **Disquisitioner** | `disquisitioner/` | Manages the structured onboarding questionnaire and conversation scope transitions |
| **Memory Scribe** | `memory-scribe/` | Reads/writes to the Qdrant vector store to maintain long-term patient health memory |
| **Requiem** | `requiem/` | Handles end-of-conversation cleanup and final state persistence |
| **Vigil Sentinel** | `vigil-sentinel/` | Monitors conversations for urgent clinical signals |

### Supported Languages

The AI chat supports: `English`, `Twi`, `French`, `Pidgin`. Pass via `?lang=` query parameter.

---

## Auth Flow

```
Request
  │
  ▼
AuthGuard
  ├─ No @Authorize decorator? → pass through (public route)
  ├─ UserType.DH_CLIENTS / DEV → Firebase verifyIdToken → request.user = DecodedIdToken
  └─ UserType.CHRONIC_CARE    → JWT verifyAsync       → request.user = LocalAuthUserPayload
  │
  ▼
RolesGuard
  ├─ No @Roles decorator? → pass through
  └─ Check request.user.role against allowed roles
```

To secure a route:
```typescript
@Authorize(UserType.DH_CLIENTS)                  // require Firebase token
@Roles(PersonnelRoles.CLINICIAN)                 // additionally restrict by role
```

Personnel roles: `clinician`, `pharmacy`.

---

## Response Shape

Every successful response is wrapped in a consistent envelope by the response interceptors:

```json
{
  "data": { ... },
  "statusCode": 200,
  "message": "Operation completed successfully"
}
```

Paginated responses include:
```json
{
  "data": {
    "rows": [...],
    "page": 1,
    "pageSize": 10,
    "count": 42
  },
  "statusCode": 200,
  "message": "..."
}
```

Use the decorator that matches the HTTP semantics of your handler:

| Decorator | Status | Use when |
|---|---|---|
| `@HandleSuccess()` | 200 | Read/GET |
| `@HandleCreate()` | 201 | POST creating a resource |
| `@HandleUpdate()` | 200 | PATCH/PUT |
| `@HandleSuccessNull()` | 200 | Success with no body |

---

## Prerequisites

Ensure the following are installed and running locally:

| Dependency | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | Check with `node -v` |
| pnpm | 11.5.2 | Install: `npm i -g pnpm@11.5.2` |
| MongoDB | ≥ 6 | Local or Atlas connection string |
| Redis | ≥ 7 | Required for caching and BullMQ queues |
| Qdrant | latest | Run locally via Docker (see below) |
| direnv | any | Loads `.envrc` — install via Homebrew or your OS package manager |

**Qdrant via Docker (quickstart):**
```bash
docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

---

## Environment Variables

Copy the example file and fill in all values:

```bash
cp .envrc.example .envrc
direnv allow
```

After any change to `.envrc`, run `direnv allow` again to reload.

### Full variable reference

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Server port. Defaults to `4815` |
| `NODE_ENV` | Yes | `development` \| `staging` \| `production` |
| `DB_NAME` | Yes | MongoDB database name (e.g. `dnh_db`) |
| `DB_CONNECTION_STRING` | Yes | MongoDB URI (Atlas or local) |
| `REDIS_URL` | Yes | Redis connection URL (used by both cache and BullMQ) |
| `JWT_SECRET` | Yes | Secret for signing/verifying personnel JWT tokens |
| `JWT_TTL` | Yes | JWT expiry duration (e.g. `1d`, `7d`) |
| `JWT_TOKEN_ISSUER` | No | JWT issuer claim |
| `FIREBASE_BASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_BASE_PRIVATE_KEY_ID` | Yes | Firebase service account private key ID |
| `FIREBASE_BASE_PRIVATE_KEY` | Yes | Firebase private key — store with literal `\n` (not real newlines) |
| `FIREBASE_BASE_CLIENT_EMAIL` | Yes | Firebase service account client email |
| `FIREBASE_BASE_CLIENT_ID` | Yes | Firebase client ID |
| `FIREBASE_BASE_CLIENT_CERT_URL` | Yes | Firebase client certificate URL |
| `BASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket name |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID (for personnel Google login) |
| `GOOGLE_API_KEY` | Yes | Google API key for Gemini LLM and embedding models |
| `GOOGLE_AI_VERSION` | No | Gemini model version. Defaults to `gemini-2.5-flash` |
| `QDRANT_URL` | Yes | Qdrant HTTP URL (e.g. `http://localhost:6333`) |
| `QDRANT_API_KEY` | No | Qdrant API key (required for cloud instances) |
| `QDRANT_HOST` | No | Qdrant host (used by some configs) |
| `LOGTAIL_SOURCE_TOKEN` | Staging/Prod | BetterStack source token |
| `LOGTAIL_HOST` | Staging/Prod | BetterStack ingestion endpoint |
| `QUEUE_TLS` | No | Set to `true` to enable TLS for the Redis/BullMQ connection |
| `NANOID_GEN` | No | Custom nanoid alphabet for code generation |

> **Firebase `private_key` format**: Copy the key from your service account JSON exactly as-is, including `\n` sequences. Do **not** convert them to real newlines in `.envrc`. The service handles the conversion internally.

---

## Local Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd giz-dnh

# 2. Install dependencies
pnpm install

# 3. Set up environment variables
cp .envrc.example .envrc
# Edit .envrc with your credentials, then:
direnv allow

# 4. Start external services
#    MongoDB — use a local instance or provide an Atlas URI in .envrc
#    Redis
redis-server

#    Qdrant
docker run -d -p 6333:6333 qdrant/qdrant

# 5. Start the dev server
pnpm start:dev
```

The server starts on port `4815` by default. You should see:

```
APP IS LISTENING ON PORT 4815
SERVER IS RUNNING AT http://localhost:4815
ACCESS SWAGGER DOCUMENTATION AT http://localhost:4815/docs
```

---

## Running the Server

```bash
# Development (watch mode — restarts on file changes)
pnpm start:dev

# Debug mode (watch + Node inspector on default debug port)
pnpm start:debug

# Production (runs compiled output from dist/)
pnpm build
pnpm start:prod
```

> **Production note**: `start:prod` forces `TZ=UTC` to ensure consistent date handling regardless of the host system timezone.

---

## API Documentation

Swagger UI is available in development and staging at:

```
http://localhost:4815/docs
```

It is **disabled in production**. The raw OpenAPI JSON is also served at `/docs-json` in non-production environments.

All routes are grouped by controller tag (sorted alphabetically). Bearer token authentication is pre-configured in the Swagger UI — click **Authorize** and paste your Firebase ID token or personnel JWT.

---

## Running Tests

```bash
# Run all unit tests
pnpm test

# Watch mode (re-runs on file changes)
pnpm test:watch

# Coverage report
pnpm test:cov

# E2E tests (uses supertest against a running app instance)
pnpm test:e2e

# Run a single test file
pnpm vitest run src/core/auth/auth.controller.spec.ts
```

### Testing conventions

- **Test runner**: Vitest with `unplugin-swc` (required for NestJS decorator metadata emission).
- **Mocking**: Use `vitest-mock-extended`'s `mockDeep<T>()` for service mocks. Do not mock Mongoose models directly — mock the service layer.
- **Globals**: `describe`, `it`, `expect`, `vi` are available without imports (`globals: true` in `vitest.config.ts`).
- **Path alias**: `@/` maps to `src/` in both `tsconfig.json` and `vitest.config.ts`.

---

## Code Quality

```bash
# Lint (auto-fix)
pnpm lint

# Format (auto-fix)
pnpm format
```

The project uses **Biome** (not ESLint/Prettier). Configuration is in `biome.json`. Style rules: single quotes, tabs for indentation, trailing commas.

A **Husky pre-commit hook** runs `lint-staged` on every commit, applying `biome check --write` to all staged `.js`/`.ts` files. Commits that fail the check are blocked until the issues are resolved.

---

## Project Conventions

### Path aliases

Use `@/` instead of deep relative paths:
```typescript
// Good
import { FirebaseService } from '@/core/firebase/firebase.service';

// Avoid
import { FirebaseService } from '../../../core/firebase/firebase.service';
```

### Barrel exports

Each directory exposes a public API via `index.ts`. Import from the barrel, not the file directly:
```typescript
import { CreateAuthDto } from './dto';        // ✅
import { CreateAuthDto } from './dto/create.dto'; // ✗ (unless barrel doesn't re-export it)
```

### Module entity ownership

Each feature module is responsible for registering and owning its Mongoose schemas. Do not import another module's model — import the module itself and use its exported service.

### Error handling in controllers

All controllers use `throwError(this.logger, error)` from `@/common/utils/responses` in catch blocks. This utility logs the error and re-throws it as the appropriate NestJS HTTP exception.

### Decorators for Swagger + response shaping

Use `@CustomApiResponse()` (from `@/common/decorators`) to simultaneously configure the Swagger response schema and apply the correct response-shaping interceptor. Pass the response type variants as the first argument:

```typescript
@CustomApiResponse(['success', 'authorize'], { type: GetPatientDto, message: 'Patient fetched' })
@Get('patient')
async getPatient() { ... }
```

Supported variants: `'success'`, `'created'`, `'updated'`, `'successNull'`, `'paginated'`, `'authorize'`, `'notfound'`.
