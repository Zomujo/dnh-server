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
└── FeaturesModule  – 16 domain modules: client, doctors, patients,
    chronic-conditions, medications, adherences, vital-histories,
    concerns, notifications, pharmacies, dh-vectors, facilities,
    appointments, hcp, chat, ussd
```

### Key conventions

- **Auth**: Two global `APP_GUARD`s. `@Authorize(UserType.X)` enables auth; `@Roles(PersonnelRoles.Y)` further restricts. No decorator = public route. Firebase for `DH_CLIENTS`/`DEV`, JWT for `CHRONIC_CARE`.
- **Response envelope**: Every controller method uses `@HandleSuccess()` | `@HandleCreate()` | `@HandleUpdate()` | `@HandleSuccessNull()` decorator for consistent `ApiSuccessResponseDto` wrapping. Use `@CustomApiResponse(...)` to combine Swagger + response shaping.
- **Path alias**: `@/` → `src/`. Import via barrel (`index.ts`) files.
- **Module ownership**: Each feature module owns its Mongoose schemas. Import the module, not another module's model.
- **Cross-module service reuse**: To reuse a service from another module, export it from the owning module's `exports` array and import that module in the consuming module. Example: `FacilitiesModule` exports `FacilitiesService`, consumed by `ClientModule` via `fetchFacilities` wrapper in `ClientService`.
- **Error handling**: Controllers use `throwError(this.logger, error)` from `@/common/utils/responses`.
- **Controller pattern**: Controllers must inject exactly one service. Cross-module logic is delegated through the owning service, never by injecting multiple services into a controller.

### DTO folder structure

Every feature module has a `dto/` folder with this standard set of files:

```
features/<module>/dto/
├── <entity>.dto.ts    # Base class — all fields + @ApiProperty / class-validator / class-transformer decorators
├── create.dto.ts      # PickType(<Entity>Dto, [...]) — fields required for creation
├── update.dto.ts      # PartialType(Create<Entity>Dto) — all optional
├── get.dto.ts         # Response DTOs (composed via IntersectionType with GenericResponseDto) + query param DTOs
└── index.ts           # Barrel — re-exports every class from the folder
```

- `<entity>.dto.ts` is the single source of truth; `create.dto.ts` selects from it via `PickType`, `update.dto.ts` wraps `Create<Entity>Dto` via `PartialType`.
- `get.dto.ts` composes read-only DTOs via `IntersectionType(PickType(..., [...]), GenericResponseDto)` and houses query-parameter DTOs (extending `PaginationRequestDto` where needed).
- Naming: `<Entity>Dto` (base), `Create<Entity>Dto` (create), `Update<Entity>Dto` (update), `Get<Entity>Dto` (response), `<Plural>QueryDto` (query params).
- Imports come from the barrel (`index.ts`), never from individual files.

## Testing

- **Runner**: Vitest with `unplugin-swc` (required for NestJS decorator metadata). Globals (`describe`, `it`, `expect`, `vi`) available without imports.
- **Solitary Testing**: Use `@suites/unit`'s `TestBed.solitary(TargetService).compile()` to automatically mock injected NestJS dependencies. Retrieve mocks via `unitRef.get(ServiceClass)` or `unitRef.get(getModelToken(Entity.name))`.
- **Mocking**: Use `vitest-mock-extended`'s `mockDeep<T>()` where custom deep mock shapes are required.
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
| `GET /client/medications/preloaded` | Paginated preloaded medication reference data with prefix search. |
| `GET /client/facilities` | Paginated facility list (same query params as `/client/chats`). |

## Medication entity gotcha

`frequency` is a sub-document (`Frequency` from notifications module: `{ repeatEvery: number, repetitionType: RepetitionType }`), **not a string**. The AI zod schema uses `FrequencySchema` from `@/features/notifications/dto/notification.schema`. The `generateMedicationDescription` service method formats it via `formatFrequency()`.

## Module reference

`src/common/utils/` contains helpers (`CodeGeneratorHelper`, `WeekDeterminantHelper`, `IanaTimezonesHelper`, `ZipHelper`, `CheckpointerUtils`).
`src/features/dh-vectors/` manages Qdrant vector store (`dh_vectors` collection, 3072d Gemini embeddings).
`src/features/facilities/` manages Facility CRUD. Exports `FacilitiesService` for cross-module use (e.g. `ClientModule`).
`src/features/hcp/` manages Healthcare Provider aggregation workflows (patient lookups, vitals trends, appointments, and facility symptom management).
`src/features/ussd/` manages USSD communication sessions for low-connectivity patient vitals reporting.

## NestJS EventEmitter2 convention

`EventEmitterModule.forRoot()` is registered globally in `CoreModule` — no per-module import needed.

- **Emit**: `this.eventEmitter.emit('some.event.name', { key: value })` — always pass a **single object payload** with named properties.
- **Listen**: `@OnEvent('some.event.name')` on a method of an `@Injectable()` class. The handler receives the same object payload.
- **Canonical example** — `MemoryScribeService.adherenceLogEvent` at `src/features/client/ai/agents/memory-scribe/memory-scribe.service.ts`:
  ```ts
  @OnEvent('adherenceLog.persist')
  async adherenceLogEvent(payload: {
    filters: AdherenceLogIdentity;
    data: AdherenceLogUpsertInput;
  }) {
    const { filters, data } = payload;
    await this.adherencesService.upsertAdherenceLog(filters, data);
  }
  ```
  Callers emit with `this.eventEmitter.emit('adherenceLog.persist', { filters, data })`.

## Chat module

The peer-to-peer chat system lives in `src/features/chat/`. Full context (schemas, events, auth, gotchas) is in [`docs/chat-backend.md`](docs/chat-backend.md). API contracts for frontend consumers are in [`docs/chat-client.md`](docs/chat-client.md) (patient) and [`docs/chat-hcp.md`](docs/chat-hcp.md) (HCP). Read the backend doc before making any chat-related changes.
