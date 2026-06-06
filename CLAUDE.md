# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start:dev          # dev server with watch
pnpm build              # compile to dist/
pnpm lint               # biome lint --write
pnpm format             # biome format --write

pnpm test               # run all unit tests (vitest run)
pnpm test:watch         # vitest watch mode
pnpm test:cov           # coverage report
pnpm test:e2e           # e2e tests (vitest + supertest)

# Run a single test file
pnpm vitest run src/core/auth/auth.controller.spec.ts
```

Env vars are loaded via **direnv** from `.envrc` — run `direnv allow` after any `.envrc` change.

## Architecture

The app is a NestJS API (`/api/v1` global prefix) organised into three top-level modules:

```
AppModule
├── CommonModule   – shared interceptors (response shaping)
├── CoreModule     – infrastructure (auth, db, cache, firebase, logging)
└── FeaturesModule – domain features (currently empty shell)
```

### CoreModule breakdown

| Sub-module | Purpose |
|---|---|
| `AuthModule` | Global guards, JWT, Google OAuth, Firebase token verification |
| `CachingModule` | Redis cache (`@nestjs/cache-manager` + `keyv/redis`) and BullMQ queues — both use `REDIS_URL` |
| `FirebaseModule` | Single Firebase app (Firestore, Storage, FCM, Auth) via `firebase-admin` |
| `DatabaseModule` | MongoDB via Mongoose (`DB_CONNECTION_STRING`, `DB_NAME`) |
| `LoggingModule` | `DomainLogger` — extends `ConsoleLogger`, forwards errors/warns to BetterStack (Logtail) in non-dev environments |

### Auth flow

Two global guards run on every request (registered as `APP_GUARD` in `AuthModule`):

1. **`AuthGuard`** — checks the `@Authorize(UserType)` decorator. If present, extracts the Bearer token and verifies it against the correct Firebase app or JWT service based on `UserType`. Populates `request.user`.
2. **`RolesGuard`** — checks `@Roles(PersonnelRoles[])`. If present, asserts `request.user.role` is in the allowed list.

To secure a route use `@Authorize(UserType.X)`. To additionally restrict by role, add `@Roles(PersonnelRoles.Y)`.

### Response shaping

All responses are wrapped using interceptor decorators from `src/common/interceptors/handler-wrappers/`:

- `@HandleSuccess()` — 200 read responses
- `@HandleCreate()` — 201 created responses
- `@HandleUpdate()` — 200 updated responses
- `@HandleSuccessNull()` — 200 with no data body

These produce a consistent `ApiSuccessResponseDto` envelope.

### Firebase credential

The base Firebase service account is composed from individual env vars (`FIREBASE_BASE_*`) in `firebase.service.ts` rather than a single JSON string. The `private_key` value is stored with escaped `\n` sequences; the service calls `.replace(/\\n/g, '\n')` before passing to `firebase-admin`.

### Path alias

`@/` maps to `src/` (configured in both `tsconfig.json` and `vitest.config.ts`).

### Tooling notes

- **Linter/formatter**: Biome (`biome.json`) — single quotes, tabs, trailing commas. No ESLint.
- **Test runner**: Vitest with `unplugin-swc` (required for `emitDecoratorMetadata` / NestJS DI). Use `vitest-mock-extended`'s `mockDeep<T>()` for service mocks in unit tests. Test globals (`describe`, `it`, `expect`, `vi`) are available without imports (`globals: true`).
- **Swagger**: available at `http://localhost:4815/docs` in dev/staging (disabled in production).
