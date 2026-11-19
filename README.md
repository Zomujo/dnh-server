# GIZ-DNH API

Backend API for the **GIZ-AYA Diabetes and Hypertension (DNH) Application** — a healthcare platform serving patients with chronic conditions (diabetes, hypertension) and the clinical personnel who manage them.

Built with **NestJS 12**, **MongoDB/Mongoose**, **Firebase**, and **Redis**.

> **Retired features.** The AI layer (LangGraph agents on Google Gemini, Whisper transcription, the Qdrant vector store) and the real-time patient–HCP chat (Socket.IO) are retired for now. Their code is kept so they can come back, but they need **no configuration**: the server boots and every core feature works without them. See [Retired features](#retired-features).

Data protection (Ghana Data Protection Act, 2012): see [`docs/data-protection.md`](docs/data-protection.md) for the data inventory, data subject rights endpoints and the data controller checklist.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Module Breakdown](#module-breakdown)
  - [AppModule](#appmodule)
  - [CommonModule](#commonmodule)
  - [CoreModule](#coremodule)
  - [FeaturesModule](#featuresmodule)
- [Retired features](#retired-features)
- [AI Agent System](#ai-agent-system)
- [Auth Flow](#auth-flow)
- [Audit Logs](#audit-logs)
- [Response Shape](#response-shape)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Setup](#local-setup)
- [Running the Server](#running-the-server)
- [Running with Docker](#running-with-docker)
- [API Documentation](#api-documentation)
- [Running Tests](#running-tests)
- [Code Quality](#code-quality)
- [Project Conventions](#project-conventions)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 12 (TypeScript 6) |
| Primary DB | MongoDB via Mongoose (`@nestjs/mongoose`) |
| Auth | Firebase Admin SDK (token verification) + JWT (personnel) |
| Caching | Redis via `@nestjs/cache-manager` + `@keyv/redis` |
| Queues | BullMQ (backed by same Redis instance) |
| AI / LLM (retired, optional) | Google Gemini (`@langchain/google-genai`) via LangChain/LangGraph |
| Vector DB (retired, optional) | Qdrant (`@qdrant/js-client-rest`) |
| AI Memory (retired, optional) | LangGraph `MongoDBSaver` checkpointer |
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
    ├── ClientModule       (patient-facing: AI chat, vitals, medications, adherence, facilities)
    ├── DoctorsModule      (clinician-facing: personnel profile & auth management)
    ├── PatientsModule
    ├── ChronicConditionsModule
    ├── MedicationsModule
    ├── AdherencesModule
    ├── VitalHistoriesModule
    ├── ConcernsModule
    ├── NotificationsModule
    ├── PharmaciesModule
    ├── DhVectorsModule    (Qdrant vector store management — retired, optional)
    ├── FacilitiesModule   (Facility CRUD)
    ├── AppointmentsModule (Appointments & appointment requests)
    ├── HcpModule          (Healthcare Provider aggregation workflows)
    ├── ChatModule         (peer-to-peer chat — retired, needs no setup)
    └── UssdModule         (USSD patient vitals reporting)
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

The `AuthController` exposes patient signup (`POST /auth/signup`, creates the Firebase user) and onboarding (`POST /auth/onboard`, creates the MongoDB patient record). Patients sign in with Firebase on the device, so there is no patient login endpoint. Personnel login (email/password and Google) and OTP verification live in `ChronicCareAuthController` (`/personnel/auth`).

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

#### AuditModule (`@Global`)

Writes the `audit_logs` collection through a global `AuditInterceptor`. See [Audit Logs](#audit-logs).

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
- `GET /client/facilities` — paginated facility list
- `DELETE /client/chats/:id` — delete a chat message
- `DELETE /client/clean/:userId` — purge all patient data (dev/admin use)

All `Client` routes require `@Authorize(UserType.DH_CLIENTS)`.

#### DoctorsModule

Clinical personnel (clinicians and pharmacy staff). Contains:
- **ChronicCareAuthModule** — personnel registration, password login, OTP verification, and Google OAuth login. Issues JWT tokens with `chronic-care` audience.
- **DoctorsController** — personnel profile management.

#### PatientsModule

Manages MongoDB `Patient` documents. Handles patient creation (called by `AuthService.signup`), retrieval, summary generation (AI-powered, event-driven via `@nestjs/event-emitter`), and updates.

#### ChronicConditionsModule / MedicationsModule / AdherencesModule / VitalHistoriesModule / ConcernsModule / PharmaciesModule / FacilitiesModule

Standard domain modules managing individual health data entities. Each owns its Mongoose schema and is responsible for registering and exporting its models and services.

#### AppointmentsModule

Manages patient clinical appointments and patient appointment requests lifecycle (`pending` → `approved`/`rejected`).

#### HcpModule

Aggregates healthcare provider workflows: assigned patient roster management, vital history trend queries, appointment management, and facility symptom resolution.

#### NotificationsModule

BullMQ-backed notification queue. The `NotificationsConsumer` processes queued FCM push notifications. Scribe tools and event handlers write to this module to schedule reminders.

#### ChatModule

> Retired: needs no setup. See [Retired features](#retired-features).

Real-time peer-to-peer chat between patients and HCPs using Socket.IO. Includes:
- Dual-auth WebSocket gateway (Firebase for patients, JWT for HCPs)
- REST endpoints for session listing, message history, and media uploads
- Push notifications via FCM for incoming messages
- In-memory presence tracking, typing/recording indicators, read receipts
- Message editing and delete-for-me/delete-for-everyone

See [`docs/chat-backend.md`](docs/chat-backend.md) for the full technical reference, and [`docs/chat-client.md`](docs/chat-client.md) / [`docs/chat-hcp.md`](docs/chat-hcp.md) for API contracts.

#### DhVectorsModule

> Retired, optional: with no Qdrant (or no `GOOGLE_API_KEY` for embeddings) configured, indexing is a no-op and searches return nothing. A configured but unreachable Qdrant is logged and retried; it never blocks startup. Erasure only needs Qdrant: while `QDRANT_URL` is set, the account purge deletes the user's vectors even without Gemini, and fails (so it can be retried) if that delete fails.

Manages the Qdrant vector collection `dh_vectors`. On module init (`OnModuleInit`) it ensures the collection and keyword indexes (`userId`, `patient`, `documentType`) exist. Uses `gemini-embedding-001` (3072-dimensional vectors) for embedding and Fuse.js for client-side fuzzy re-ranking of semantic search results.

#### UssdModule

Provides Africa's Talking USSD integration endpoints for low-connectivity patient vitals reporting and health check-ins.

---

## Retired features

### AI (Gemini, Whisper, Qdrant)

None of the AI env vars are needed. Each AI client is built only when its key is set (`src/common/utils/ai-features.ts`):

| Without… | Behaviour |
|---|---|
| `GOOGLE_API_KEY` | `POST /client/chat`, `POST /client/chat/audio` and the pharmacy patient summary SSE answer **503** "AI features are not enabled on this server". Medication/notification reminders are sent with a plain template ("Hi Ama, a reminder: Take Metformin.") instead of AI-written text. Adherence patterns are still computed, with empty notes. |
| `OPENAI_API_KEY` | `POST /client/chat/audio` answers 503. |
| `QDRANT_URL` (or `GOOGLE_API_KEY`) | The vector store is off: indexing is skipped and similarity lookups find nothing, so callers use their exact-match lookups. With `QDRANT_URL` set but no `GOOGLE_API_KEY`, Qdrant is still used to erase vectors on account purge. |

To bring the AI back, set the variables in the "Optional — retired AI features" section of `.envrc.example`.

### Real-time chat (Socket.IO)

The chat gateway needs no setup. It runs on the same HTTP port as the API with Socket.IO's default in-memory adapter: no extra port, env var, Redis adapter or sticky sessions. A reverse proxy in front of the API does **not** need WebSocket upgrade support unless chat is re-enabled. (If it is, and the API runs on more than one instance, add sticky sessions or a Socket.IO Redis adapter, since presence is tracked in memory.)

## AI Agent System

> Retired — see [Retired features](#retired-features).

The AI layer lives in `src/features/client/ai/` and is built on **LangGraph** with **Google Gemini** (`gemini-2.5-flash` by default, overridable via `GOOGLE_AI_VERSION`).

### LangGraph Conversation Agent (`ClientAIService`)

The core conversational agent uses a `StateGraph` with:
- `llmCall` node — invokes Gemini with the current `ConversationScope` prompt
- `toolNode` — executes tool calls returned by the LLM
- Conditional edge: if the last message has tool calls, route to `toolNode`; otherwise `END`

**Conversation scopes** (`ConversationScope`) represent structured interview stages: `general` → `chronicConditions` → `medications` → `vitalHistory` → `concerns` → `end`. The LLM calls the `changeConversationScope` tool to advance through stages.

**Checkpointing** — conversation state is persisted to MongoDB via `MongoDBSaver`, keyed by `userId`. This provides full multi-turn memory across sessions without re-loading history on every request.

**Message trimming** — before each LLM call, messages are trimmed to 80,000 tokens (strategy: `last`) to stay within context limits.

### Specialist Agents & Scribe Tools

| Agent / Tool | File | Role |
|---|---|---|
| **Archonen** | `archonen/` | Context retrieval & clinical knowledge agent — queries Qdrant vector store (`DhVectorsService`) for relevant patient history and clinical vectors |
| **Memory Scribe** | `memory-scribe/` | Event-driven persistence bridge — exposes LangGraph dynamic tools for adherence logs, patterns, chronic conditions, concerns, medications, vitals, notifications, and emergency alerts |
| **Vigil Sentinel** | `vigil-sentinel/` | Clinical escalation monitor — detects acute symptoms or critical vital readings and dispatches emergency alerts to care facilities |

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

### Rate limits on staff sign-in

| Limit | Applies to | When reached |
|---|---|---|
| 5 sign-in attempts per email in 15 minutes; a correct one resets the count | `POST /personnel/auth/login` with email and password, whether or not the email has an account | The next attempt returns 429, and that email's password sign-in stays refused for 15 minutes, even with the right password. Google sign-in is unaffected |
| 5 verification codes per email per hour | Every code sent: onboarding and `POST /personnel/auth/otp/re-send` | `otp/re-send` returns 429 for an hour. Onboarding still succeeds; a code sent earlier still works |
| Per IP, per minute: signup 5, login 10, `otp/re-send` 3, `otp/verify` 10 | Those routes | 429 |

The per-email counts live in Redis (`throttle:login-attempt:<email>`, `throttle:otp-send:<email>`). Each check counts and compares in one atomic step, so parallel requests cannot get past a limit. To unlock an email early, delete its `throttle:*` and `throttle:block:*` keys.

---

## Audit Logs

Every audited request adds one document to the `audit_logs` MongoDB collection (`src/core/audit/`). A global interceptor writes it after the response has been sent, so it records the real status code. If the client disconnects first, it waits for the handler to finish: an error is recorded with its status, and a handler that completes is recorded as `aborted` with no status code. Requests the auth guards reject never reach interceptors; `AuditDeniedMiddleware` records those. Writes are fire-and-forget: a failed write is logged but never fails or delays the request.

### What is recorded

| Requests | Examples |
|---|---|
| Every write (`POST`/`PUT`/`PATCH`/`DELETE`) by a signed-in patient or personnel | `PATCH /api/v1/hcp/patients/:id` |
| Personnel reads of patient health data (routes under `patients`, `vital-histories`, `vitals`, `medications`, `adherence`, `symptoms`, `concerns`, `appointments`, `appointment-requests`, `chat`) | `GET /api/v1/hcp/patients/:patientId/medications` |
| Full data exports (right of access / portability), by the patient or by a clinician, recorded as `EXPORT` | `GET /api/v1/client/data-export`, `GET /api/v1/hcp/patients/:id/data-export` |
| Auth events, successful or not: personnel login (password and Google), signup, onboarding, OTP send/verify; patient signup and onboarding | `POST /api/v1/personnel/auth/login` → `LOGIN`, 401 |
| Requests to token-protected routes rejected by `AuthGuard` (401: missing, expired or invalid token) or `RolesGuard` (403: wrong role) | `GET /api/v1/hcp/patients/:id` → `ACCESS_DENIED`, 403 |

Each entry holds:

- `timestamp`
- `actor`: `kind` (`personnel` / `patient` / `anonymous`), `userType` (token audience), `userId` (personnel id or patient Firebase uid), `role` and `facilityId` for personnel, `personnelId`/`patientId` when known. A failed login has no user id.
- `action`: `CREATE`, `READ`, `EXPORT`, `UPDATE`, `DELETE`, `LOGIN`, `SIGNUP`, `ONBOARD`, `OTP_SEND`, `OTP_VERIFY`, `ACCESS_DENIED`. A rejected request is anonymous unless its token was valid and only the role check failed.
- `method`, `route` (the route template, e.g. `/api/v1/hcp/patients/:id`, never the raw URL)
- `resourceType`, `resourceId` (from the route params), `patientId` (the patient whose data was touched, when the route names one)
- `statusCode`, `outcome` (`success` below 400, otherwise `failure`; `aborted` with no `statusCode` when the client disconnected and the handler then completed, i.e. the action ran but no response was delivered)
- `ip` (the client IP, honouring `TRUST_PROXY`), `userAgent`, `requestId` (`X-Request-Id` / `X-Railway-Request-Id`, if sent)

### What is never recorded

Request and response bodies, query strings, the `Authorization` header or any token, passwords, OTPs, email addresses and phone numbers. On a successful login only the personnel id is read from the response.

Not recorded: patients reading their own data, unauthenticated requests other than the auth events (health check, public facility list), Swagger, and the USSD callback (each menu step is a `POST` from Africa's Talking whose only identity is the caller's phone number).

### Known limitations

- `patientId` is empty for several personnel reads whose route doesn't name the patient: `appointments/:id`, `appointment-requests/:id`, `vital-histories/:id` (both `/hcp` and `/personnel/pharmacies`), chat room messages (`chat/hcp/rooms/:roomId/messages`), and patient lists (`hcp/patients`, `personnel/pharmacies/patients`). `resourceId` and `route` still say what was read, but finding "everyone who read patient X" needs a join through that resource.
- An `Idempotency-Key` replay is recorded as a second entry (same action and resource), even though the handler did not run again.
- Patients reading their own data are not recorded (by decision), except a full data export. A consent change (`PUT /api/v1/client/consent`) is recorded as an `UPDATE` by the patient; reading consent is not. A patient's own export and consent change name no patient in the route, so `patientId` is empty and the patient is `actor.userId` (Firebase uid).

### Retention

A TTL index on `timestamp` deletes entries after `AUDIT_LOG_TTL_DAYS` days. **The default of `730` (2 years) is a placeholder and still needs GHS sign-off.**

The index is created at startup. When the value changes, the next start updates it: in place with `collMod` if the database user has `dbAdmin` (or another role with the `collMod` action) on the database; with only `readWrite`, the index is dropped and recreated instead, so nothing expires for the moment in between. The log line `Audit log retention: … days` / `Audit log retention updated to … days` shows the value in force; if both paths fail, the error log says which retention still applies.

### Querying

There is no API endpoint for audit logs; query MongoDB directly with a read-only user:

```js
// Who accessed a patient's records in the last 30 days
db.audit_logs.find({
  patientId: '<patient id>',
  timestamp: { $gte: new Date(Date.now() - 30 * 864e5) },
}).sort({ timestamp: -1 })

// Everything a personnel account did
db.audit_logs.find({ 'actor.userId': '<personnel id>' }).sort({ timestamp: -1 })

// Failed logins by IP
db.audit_logs.aggregate([
  { $match: { action: 'LOGIN', outcome: 'failure' } },
  { $group: { _id: '$ip', attempts: { $sum: 1 }, last: { $max: '$timestamp' } } },
  { $sort: { attempts: -1 } },
])
```

Indexes: `timestamp` (TTL), `actor.userId + timestamp`, `resourceId + timestamp`, `patientId + timestamp`. A patient's `actor.userId` is their Firebase uid, which matches `patients.userId`.

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
| Node.js | ≥ 22.12 | Check with `node -v` (NestJS 12 needs ≥ 20.19 or ≥ 22.12) |
| pnpm | 11.5.2 | Install: `npm i -g pnpm@11.5.2` |
| MongoDB | ≥ 6 | Local or Atlas connection string |
| Redis | ≥ 7 | Required for caching and BullMQ queues |
| Qdrant | ≥ 1.10 | **Not required** — only for the retired AI features. The search uses the Query API added in 1.10 |
| direnv | any | Loads `.envrc` — install via Homebrew or your OS package manager |

**Qdrant via Docker (only if re-enabling the AI features):**
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
| `JWT_TOKEN_ISSUER` | Yes | Issuer claim on personnel tokens, e.g. `dnh-server-production`; staff login fails with a 500 without it. Use a different value per environment |
| `FIREBASE_BASE_PROJECT_ID` | Yes | Firebase project ID |
| `FIREBASE_BASE_PRIVATE_KEY_ID` | Yes | Firebase service account private key ID |
| `FIREBASE_BASE_PRIVATE_KEY` | Yes | Firebase private key — store with literal `\n` (not real newlines) |
| `FIREBASE_BASE_CLIENT_EMAIL` | Yes | Firebase service account client email |
| `FIREBASE_BASE_CLIENT_ID` | Yes | Firebase client ID |
| `FIREBASE_BASE_CLIENT_CERT_URL` | Yes | Firebase client certificate URL |
| `BASE_STORAGE_BUCKET` | Yes | Firebase Storage bucket name |
| `GOOGLE_CLIENT_ID` | Yes | OAuth client IDs the staff app's Google sign-in tokens are issued for, comma-separated (Android, iOS, web). Google sign-in returns 503 while it is empty |
| `LOGTAIL_SOURCE_TOKEN` | Staging/Prod | BetterStack source token |
| `LOGTAIL_HOST` | Staging/Prod | BetterStack ingestion endpoint |
| `QUEUE_TLS` | No | Set to `true` to enable TLS for the Redis/BullMQ connection |
| `NANOID_GEN` | No | Custom nanoid alphabet for code generation |
| `AUDIT_LOG_TTL_DAYS` | No | Days audit log entries are kept before MongoDB deletes them. Defaults to `730` (2 years), pending GHS sign-off |

### Optional — retired AI features

Leave these unset unless you are bringing the AI back (see [Retired features](#retired-features)).

| Variable | Description |
|---|---|
| `GOOGLE_API_KEY` | Google API key for Gemini chat and embedding models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Google Generative AI key (kept alongside `GOOGLE_API_KEY`) |
| `GOOGLE_AI_VERSION` | Gemini model version. Defaults to `gemini-2.5-flash` |
| `OPENAI_API_KEY` | OpenAI key for Whisper voice-note transcription |
| `QDRANT_URL` | Qdrant HTTP URL (e.g. `http://localhost:6333`). Also needs `GOOGLE_API_KEY` |
| `QDRANT_API_KEY` | Qdrant API key (required for cloud instances) |
| `QDRANT_HOST` | Qdrant host, for the legacy setup where `QDRANT_URL` holds only a port |

> **Firebase `private_key` format**: Copy the key from your service account JSON exactly as-is, including `\n` sequences. Do **not** convert them to real newlines in `.envrc`. The service handles the conversion internally.

---

## Local Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd dnh-server

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

#    Qdrant is not needed (retired AI features only)

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

## Running with Docker

The `Dockerfile` builds a production image (Node 22, runs as the non-root `node` user, `NODE_ENV=production`, `TZ=Africa/Accra`, port `4815`). Its `HEALTHCHECK` calls `GET /`, which answers `{"status":"OK"}`. The image holds no secrets: configuration comes from environment variables at run time. Qdrant and the AI providers aren't part of this deployment. On `SIGTERM` (`docker stop`) Nest runs its shutdown hooks, closing queue workers and the MongoDB/Redis connections before exiting.

**TLS**: the API speaks plain HTTP. Terminate TLS at a reverse proxy (nginx, Caddy or the GHS load balancer) in front of it, and don't expose port `4815` publicly.

### VPS deployment (staging and production)

For a VPS where MongoDB is hosted elsewhere, use [`deploy/`](deploy/RUNBOOK.md): on the server, `/opt/dnh-server/deploy.sh <staging|production>` clones the environment's branch, builds the image and swaps the running container, and `deploy/compose.yml` runs each environment's API with its own Redis beside it. Follow [deploy/RUNBOOK.md](deploy/RUNBOOK.md) for set-up, deploys and rollbacks. The rest of this section covers the single-host compose stack and running the image by hand.

### Configuration

Create `.env.production` from `.envrc.example`: remove each `export ` prefix so every line is a plain `KEY=value`, then fill in the values. Keep the escaped `\n` sequences in `FIREBASE_BASE_PRIVATE_KEY` on one line. The file is ignored by git and by the Docker build. At minimum set:

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `DB_NAME`, `DB_CONNECTION_STRING` | MongoDB ≥ 6 (compose sets the connection string) |
| `REDIS_URL` | Redis ≥ 7 (compose sets it) |
| `JWT_SECRET`, `JWT_TTL`, `OTP_TTL`, `JWT_TOKEN_ISSUER` | Personnel auth; staff login fails with a 500 if `JWT_TOKEN_ISSUER` is unset |
| `FIREBASE_BASE_*`, `BASE_STORAGE_BUCKET` | Firebase service account and storage bucket |
| `EMAIL_*` | SMTP for verification emails |
| `CORS_ORIGINS` | Browser origins allowed to call the API (the HCP web app) |
| `TRUST_PROXY` | **Exact** number of proxies in front of the API: `1` for one reverse proxy, `2` for a load balancer plus proxy, `0` (or `false`) if clients connect directly. Defaults to `1` when unset. Too high a value lets clients spoof `X-Forwarded-For`, which bypasses `USSD_ALLOWED_IPS` and per-IP rate limiting. Compose sets it from `.env`. |

See [Environment Variables](#environment-variables) for the full list. Leave `QUEUE_TLS` empty unless Redis uses TLS: any non-empty value, even `false`, turns TLS on.

**Quoting**: `.env.production` is written for Docker Compose, whose parser expands `$VAR` / `${VAR}` and treats ` #` as the start of a comment in unquoted values. `docker run --env-file` does neither, but keeps quotes as part of the value. So avoid `$` and ` #` in secret values (`openssl rand -hex 32` makes safe ones). If a value must contain them, wrap it in single quotes; that file then works only with compose.

### Docker Compose (API + MongoDB + Redis)

Compose needs a second file, `.env`, next to `docker-compose.yml` for the stack's own settings:

```bash
cp .env.compose.example .env     # set MONGO_ROOT_PASSWORD, REDIS_PASSWORD, TRUST_PROXY
docker compose up -d --build     # build the image and start everything
docker compose ps                # api shows "healthy" once GET / answers
curl http://127.0.0.1:4815/      # {"status":"OK"}, from the Docker host
```

- MongoDB is created with a root user (`MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD`) and Redis requires `REDIS_PASSWORD`. Use URL-safe passwords, because compose builds `DB_CONNECTION_STRING` (`mongodb://user:pass@mongo:27017/?authSource=admin`) and `REDIS_URL` (`redis://:pass@redis:6379`) from them, whatever `.env.production` says. The Mongo user is created only on the first start of an empty `mongo-data` volume.
- Data persists in the `mongo-data` and `redis-data` volumes (Redis runs with `appendonly`). MongoDB and Redis aren't published on the host. The API starts after both report healthy.
- The API is published on `127.0.0.1:4815` only, for a reverse proxy on the same host. Docker-published ports bypass host firewalls such as `ufw`, so don't bind it to `0.0.0.0`. If the proxy runs on another machine, set `API_BIND_ADDRESS` in `.env` to a private interface address and restrict access to that address in the network.

### Image only (external MongoDB and Redis)

```bash
docker build -t dnh-api .
docker run -d --name dnh-api --init --restart unless-stopped \
  --env-file .env.production -p 127.0.0.1:4815:4815 dnh-api
```

`--init` (or `init: true` in compose) passes `docker stop`'s `SIGTERM` to Node so the shutdown hooks run.

### Logs

The API logs to stdout/stderr:

```bash
docker compose logs -f api       # compose
docker logs -f dnh-api           # plain docker run
```

With `LOGTAIL_SOURCE_TOKEN` and `LOGTAIL_HOST` set, errors and warnings also go to BetterStack.

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
pnpm vitest run src/core/auth/auth.service.spec.ts
```

### Testing conventions

- **Test runner**: Vitest with `unplugin-swc` (required for NestJS decorator metadata emission).
- **Solitary Testing**: Use `@suites/unit` (`TestBed.solitary(TargetService).compile()`) to isolate services and automatically mock all injected dependencies. Retrieve mocks via `unitRef.get(ServiceClass)` or `unitRef.get(getModelToken(Entity.name))`.
- **Mocking**: Use `vitest-mock-extended`'s `mockDeep<T>()` where custom deep mock shapes are required.
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
