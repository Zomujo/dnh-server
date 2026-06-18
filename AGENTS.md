# AGENTS.md

## Commands

```bash
pnpm start:dev       # dev server (watch mode) on port 4815
pnpm build           # nest build -> dist/
pnpm start:prod      # TZ=UTC node dist/main
pnpm lint            # biome lint --write
pnpm format          # biome format --write
pnpm test            # vitest run  (src/**/*.spec.ts)
pnpm test:cov        # vitest run --coverage
pnpm test:e2e        # vitest run --config ./test/vitest.e2e.config.ts
pnpm vitest run path/to/file.spec.ts  # single test file
```

- **Env loading**: `direnv` loads `.envrc` — run `direnv allow` after any change. `.envrc` is gitignored; use `.envrc.example` as template.
- **Pre-commit**: Husky runs `pnpm lint-staged` → `biome check --write --no-errors-on-unmatched` on staged `.ts`/`.js` files. Commits that fail lint are blocked.
- **Build**: `nest-cli.json` sets `deleteOutDir: true` — clean build each time.

## Linting & Formatting

- **Biome only** (no ESLint / Prettier). Config at `biome.json`.
- Style: single quotes, tabs, trailing commas, line width 80.
- `biome check` auto-organises imports on save.

## Architecture

NestJS 11 API at `/api/v1` (except `GET /` which is a health-check):

```
AppModule
├── CommonModule    – response interceptors (@HandleSuccess, @HandleCreate, etc.)
├── CoreModule      – Auth (global guards), DB (Mongoose), Caching (Redis+BullMQ),
│                     Firebase (Admin SDK), Logging (BetterStack in non-dev)
└── FeaturesModule  – 11 domain modules: client, doctors, patients,
    chronic-conditions, medications, adherences, vital-histories,
    concerns, notifications, pharmacies, dh-vectors
```

### Key conventions

- **Auth**: Two global `APP_GUARD`s. `@Authorize(UserType.X)` enables auth; `@Roles(PersonnelRoles.Y)` further restricts. No decorator = public route. Firebase for DH_CLIENTS/DEV, JWT for CHRONIC_CARE.
- **Response envelope**: Every controller method uses `@HandleSuccess()` | `@HandleCreate()` | `@HandleUpdate()` | `@HandleSuccessNull()` decorator for consistent `ApiSuccessResponseDto` wrapping. Use `@CustomApiResponse(...)` to combine Swagger + response shaping.
- **Path alias**: `@/` → `src/`. Import via barrel (`index.ts`) files.
- **Module ownership**: Each feature module owns its Mongoose schemas. Import the module, not another module's model.
- **Error handling**: Controllers use `throwError(this.logger, error)` from `@/common/utils/responses`.

## Testing

- **Runner**: Vitest with `unplugin-swc` (required for NestJS decorator metadata). Globals (`describe`, `it`, `expect`, `vi`) available without imports.
- **Mocking**: Use `vitest-mock-extended`'s `mockDeep<T>()` for service mocks. Do not mock Mongoose models directly — mock the service layer.
- **Coverage excludes**: `*.spec.ts`, `*.module.ts`, `src/main.ts`.

## Firebase gotcha

`FIREBASE_BASE_PRIVATE_KEY` must be stored with literal `\n` sequences (not real newlines). The service calls `.replace(/\\n/g, '\n')` at runtime.

## AI / LangGraph

Patient-facing AI lives in `src/features/client/ai/` (LangGraph + Google Gemini). Multi-turn conversation state persisted to MongoDB via `MongoDBSaver`. Supported chat languages: English, Twi, French, Pidgin (`?lang=` query param).

## Swagger

Available at `http://localhost:4815/docs` in dev/staging. Disabled in production. Tags sorted alphabetically.

## Client medication endpoints

| Endpoint | Description |
|---|---|
| `GET /client/medications` | Paginated medication list (no adherence data) |
| `GET /client/medications/today?section=MORNING` | Today's meds filtered by section (MORNING/AFTERNOON/EVENING). Returns `name`, `dosage`, `purpose`, `toBeTakenAt`. |
| `GET /client/medications/:id/adherence?date=2026-06-15` | Monthly adherence logs (one per day) + `adherenceRate`. Uses MongoDB aggregation. |
| `PUT /client/medications/:id/confirm` | Creates/updates today's adherence log (taken=true). Resolves `toBeTakenAt` from `startDate` time (defaults 8AM if date-only). |
| `GET /client/medication-adherence?showWeekdays=true` | 30-day adherence rate + optional weekday breakdown. |

## Medication entity gotcha

`frequency` is a sub-document (`Frequency` from notifications module: `{ repeatEvery: number, repetitionType: RepetitionType }`), **not a string**. The AI zod schema uses `FrequencySchema` from `@/features/notifications/dto/notification.schema`. The `generateMedicationDescription` service method formats it via `formatFrequency()`.

## Module reference

`src/common/utils/` contains helpers (`CodeGeneratorHelper`, `WeekDeterminantHelper`, `IanaTimezonesHelper`, `ZipHelper`, `CheckpointerUtils`).
`src/features/dh-vectors/` manages Qdrant vector store (`dh_vectors` collection, 3072d Gemini embeddings).
