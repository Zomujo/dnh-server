# Backend Issue Tracker — Platform Technical Audit (6 Aug 2026)

Source: `Platform-Technical-Audit.pdf`. This tracker covers only findings that live in
`dnh-server` (this repo) — `yelima-mobile` (Flutter) and `HCP-WebApp` (unconnected
Next.js prototype) findings are excluded except where the server side of a shared
defect is implicated.

Status values: `Open` · `In progress` · `Resolved` · `Won't fix` (add a one-line reason
if you use the last one).

## Security (§2)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 2.1 | `DELETE /api/v1/client/clean/:userId` has no auth guard — irreversibly purges a patient's entire record with no transaction, soft-delete, or audit trail | `client.controller.ts:632-651` | Critical | **Resolved** — route now `authorize`-gated, target derived from token (`GetUser('sub')`), no arbitrary userId/patientId params |
| 2.2 | `POST /personnel/auth/signup` is public; role hardcoded to `CLINICIAN` server-side regardless of input | `chronic-care-auth.controller.ts:23-39`, `chronic-care-auth.service.ts:27-32` | Critical | **Resolved** — see notes below |
| 2.2b | `POST /personnel/auth/onboard` is public and creates a second, disconnected Personnel document instead of completing signup | `chronic-care-auth.service.ts:37-45` | High | **Resolved** — see notes below |
| 2.3 | Facility scoping fails open (`create()` never persists `facility`); every per-patient route does existence checks only, no facility/care-team comparison | `hcp.controller.ts:165,184,215,242,267,292,323,347,374-463`; `patients.service.ts:283-285` | Critical | **Resolved (by product decision, not facility scoping)** — see notes below |
| 2.4 | Google OAuth sign-in falls back to `password = email` — full account-takeover path, plus duplicate Personnel records for existing users | `chronic-care-auth.service.ts:80-118` | Critical | **Resolved** — see notes below |
| 2.5 | Unauthenticated, DB-backed endpoints: full patient list (paginated + unpaginated), any patient's latest vitals, any patient record, clinical summary SSE, full notification CRUD, med catalogue, debug auth scaffolding | `patients.controller.ts:36-41,93,112,127-132,145`; `notifications.controller.ts:77-176`; `seeded-meds.controller.ts:54`; `main.ts:26` | Critical | **Resolved** — see notes below |
| 2.6 | IDOR: patient can rewrite any other patient's medication dosage/times; chat delete filters loosely; bulk "receive-choice" endpoint can falsify any patient's adherence records | `medications.service.ts:253,354`, `client.service.ts:257-269`, `medications.service.ts:239-251` | High | **Resolved** — see notes below |
| 2.7 | `searchFields`/`orderBy` bypass the global validation whitelist → unescaped `RegExp` from client input. ReDoS pre-auth on 4 endpoints; character-by-character oracle can extract Ghana Card/NHIS numbers via the unauthenticated patient list. `pageSize`/`page` unbounded | `pagination-filter.factory.ts:42-50`; `patients.service.ts:277,329`; `notifications.service.ts:76`; `seeded-meds.service.ts:23` | High | **Resolved** — see notes below |
| 2.8 | AI memory-scribe tools accept `{filters, data}` straight from LLM output with `upsert:true`, never compared against the authenticated caller — prompt injection becomes a cross-tenant write | `memory-scribe.service.ts:141-235` | Critical | **Resolved** — see notes below |
| 2.9 | Plaintext passwords logged; JWT payload logged on every signing; generic error handler leaks raw internal error text to clients | `auth.service.ts:75-80,159`; `common/dto/error.dto.ts:52` | High | **Resolved** — see notes below |
| 2.10 | JWT audience/issuer signed but never verified; `JWT_TOKEN_ISSUER` missing from `.envrc.example`; no revocation path for 24h tokens | `auth.service.ts:148-169`; `auth.module.ts:13-21`; `ws-auth.verifier.ts:49` | Low/Medium | **Resolved** — see notes below |

### Notes — 2.2 / 2.2b / 2.4 (`chronic-care-auth.service.ts`)

Verification moved from `Personnel.isVerified` (removed) to a new per-account
`PersonnelAccount.verificationStatus` (`unverified` / `verified` / `exempt`), since a
personnel can hold both a Google account and an email/password account with different
trust levels. `login()` now looks accounts up by `{provider, providerUserId}` for Google
or `{provider: EMAIL, email}` for password — never by email alone — which also closes
the account-takeover path (no password is ever set on Google-provisioned accounts
anymore, so there's nothing to guess).

`OTP_REQUIRED_ROLES` (currently `[CLINICIAN]`) gates who must complete OTP at
`/onboard`. `PHARMACY` is deliberately excluded per product decision (no OTP UI on that
side yet) — those accounts land in `EXEMPT`, not `VERIFIED`, so they stay queryable and
distinct from genuinely-verified accounts once pharmacy OTP ships (just add
`PersonnelRoles.PHARMACY` to the array).

**Residual, accepted risk:** self-signup + `/onboard {role: "pharmacy"}` still yields a
usable pharmacy-role token with zero identity verification — only a real, existing
facility ID is required (added check below). Accepted as-is per product for now given
no pharmacy UI exists; revisit when pharmacy OTP ships.

**Bonus find while implementing:** `CreatePersonnelDto.personnelId` is `@IsOptional()`,
and `findByIdAndUpdate`/`exists`/`countDocuments` all collapse an `undefined` `_id`
filter to `{}` (verified against this repo's mongoose 9.6.3) — an `/onboard` call that
simply omits `personnelId` would have silently overwritten an arbitrary existing
personnel record. Fixed with an explicit `isValidObjectId` + `.exists()` guard in the
service (not a DTO validator change). Same pass also added a `facilitiesService.findOne()`
check so `/onboard` rejects a fabricated `facility` id.

**Follow-up, not in this pass:** `personnel-accounts/personnel-accounts.service.ts`
(`googleAccountLink`, authenticated account-linking) has the same `password: email ||
googleId` pattern this fix removed from the main auth flow. Lower urgency since it's
behind auth, but same root cause — worth the same fix later.

### Notes — 2.3 (facility scoping) and 2.5 (unauthenticated endpoints)

**2.3 was resolved by explicit product decision, not by adding facility-based access
control.** Patients are not restricted to one facility (interoperability — a patient may
legitimately be seen at multiple facilities), so **find/read and create stay open to any
authenticated clinician** across `hcp.controller.ts` — no facility-membership check was
added there. Instead:

- **Create actions now persist provenance.** `Patient` gained a `createdBy` field
  (`patients/entities/patient.entity.ts`); `createByPersonnel()` now derives `facility`
  from the creating personnel's own token instead of trusting the request body
  (`patients.service.ts`). `VitalHistory` gained a `facility` field, set the same way at
  creation (`vital-histories.service.ts:create`).
- **Update/delete actions now require personnel identity, not facility match.**
  `Appointment.cancel/reschedule/complete` (`appointments.service.ts`) and
  `VitalHistory` update/delete — both the patient-nested log route
  (`hcp.controller.ts` → `updateVitalHistoryLog`) and the direct cluster-ID routes
  (`hcp.controller.ts` `/hcp/vital-histories/:id` and the pharmacy-side
  `vital-histories.controller.ts`) — now throw `ForbiddenException`/`NotFoundException`
  unless the acting personnel is the one who created the record (`hostPersonnel` /
  `createdBy`).
- **Deliberately left unchanged:** `Concern` (symptoms) and `AppointmentRequest` are
  patient-authored — there's no personnel "owner" to check identity against — so they
  keep their existing `host`-facility-based scoping rather than being migrated to the
  new personnel-identity pattern. `updatePatient` (editing the shared demographic
  record) also has no identity check by design — patients are legitimately edited by
  many treating clinicians over time; locking that to the original creator would
  contradict the interoperability goal.

**2.5 is partially resolved.** While wiring the above, found that `patients.controller.ts`
had since moved from a bare `/personnel/patients` route to `personnel/pharmacies/patients`
(commit "add pharmacy patient creation and un-scope pharmacy patient listing") — and in
that move, several routes lost their auth entirely: `findAllNoPaginate`,
`fetchLatestPatientVitals`, `findOne`, and the `summary/:patientId` SSE endpoint were all
fully public. Its sibling `personnel/pharmacies/vital-histories`
(`vital-histories.controller.ts`, registered — the audit's §10 claim that this controller
is unregistered is now stale) had the identical gap on 4 more GET routes. Fixed: all now
require `authorizeChronicCare`, and — since neither controller had *any* role restriction
before, despite living under `/pharmacies/` — added `@Roles(PersonnelRoles.PHARMACY)`
throughout both for consistency with how `hcp.controller.ts` scopes to `CLINICIAN`.

**2.5 is now fully resolved.** Remaining gaps closed:

- **`notifications.controller.ts`** — all 5 CRUD routes (`create`, `findAll`, `findOne`,
  `update`, `remove`) had no auth token at all; only the FCM-token routes were gated.
  Added `authorizeChronicCare` to all 5, no `@Roles` restriction (both clinicians and
  pharmacy staff plausibly manage patient notification schedules), consistent with 2.3's
  precedent of not facility/role-restricting patient-adjacent records.
- **`seeded-meds.controller.ts`** — all 5 CRUD routes had no auth token. Per explicit
  product decision, `findAll`/`findOne` were left fully public — this is a shared
  reference catalog of drug names/dosing units with nothing patient-specific or sensitive
  in it, and it's read by all user types. `create`/`update`/`remove` (the routes that can
  actually corrupt the catalog) now require `authorizeChronicCare`. No role restriction
  possible here either way — `PersonnelRoles` only has `CLINICIAN`/`PHARMACY`, no admin
  tier to scope catalog-editing to.
- **Debug auth scaffolding** — see the 2.9 notes above: `AuthController`'s unauthenticated
  `GET /auth/test` (writes to a hardcoded Firestore doc) and `POST /auth`
  (`testNotification`, sends an arbitrary FCM push to any supplied token) were found while
  closing 2.9 and bucketed here per product decision — left as-is, not fixed.
- **Permissive CORS (`main.ts:21`, `app.enableCors()`)** — left as an accepted gap by
  product decision. There's currently no known real web-client origin to allowlist
  (`HCP-WebApp` is an unconnected prototype per this doc's header), and the mobile client
  doesn't send an `Origin` header, so it isn't affected either way. Revisit once there's a
  real web origin to restrict to.

### Notes — 2.6 (IDOR)

Medication update/delete (`client.controller.ts` → `medications.service.ts`) and chat
message delete (`removeChatMessages`) now scope their lookup by the authenticated
caller's `userId` in addition to the record id — a mismatch falls through to the
existing `NotFoundException`, same pattern as the earlier vital-history-log fix.

The bulk `receive-choice` endpoint (`PUT /chronic-care/doctors/medications/receive-choice`)
was **deleted entirely, not fixed**, per explicit instruction — it was retired
functionality (its controller was already commented out of `medications.module.ts`, so
the route was unreachable regardless). Removed: `MedicationsController` (the file — its
only route was this one), `MedicationsService.receiveChoice`,
`MedicationNotificationChoiceDto`, `AdherencesService.updateManyAdherenceLogs`, and
`UpdateAdherenceLogQueryDto` (confirmed via repo-wide grep, including specs, that nothing
else referenced any of these).

### Notes — 2.7 (ReDoS / PII-extraction oracle via search)

This turned out to be two separable problems that needed two different fixes:

**Unescaped regex (ReDoS + precise anchored extraction).** `new RegExp(search, 'i')`
compiled the client's `search` string as a real pattern, not literal text — anchors
(`^`), wildcards, and catastrophic-backtracking patterns all worked. Added
`escapeRegExp()` (`common/utils/helpers/regex.helper.ts`) and applied it everywhere a
client- or model-supplied string reaches `new RegExp()`: the shared `generateFilter`
factory, plus four one-off call sites that had the same pattern
(`adherences.service.ts`, `adherence.util.ts` ×2, `chronic-conditions.service.ts`,
`medications.service.ts:125` — the last one is also 6.5's injection vector). Also
consolidated three places that had already hand-rolled the same escape inline
(`facilities.service.ts`, `personnel-accounts.service.ts`, `client.service.ts`) onto the
shared helper instead of three copies that could drift.

**Client-controlled `searchFields` (field-selection oracle) — escaping alone doesn't fix
this.** Even a fully-escaped literal-substring search against an arbitrary field is still
a presence/absence oracle against a field the API was never meant to expose (e.g.
`ghanaCardNumber`, deliberately absent from every response projection). Fixed by having
`generateFilter` take the *same projection the caller already passes to `.select()`* as
an allowlist — one source of truth, so a field excluded from the response can't be
searched either. `resolveSearchableFields()` handles both Mongoose projection styles:
inclusion (`'name age'` → those fields are the allowlist) and exclusion (`'-password
-qdrantId'` → allowlist is the complement, but only computable if the full field set is
supplied; without it, exclusion-style projections **deny all custom search fields** by
design, rather than misreading `-password` as permission to search `password`). No
current call site uses exclusion-style projections, so this path isn't exercised today,
but it's implemented and safe-by-default for when one does.

Updated the 4 call sites that had a real `.select()` to derive from (`patients.service.ts`
×2, `notifications.service.ts`) to pass it into `generateFilter`. The other 3 live
consumers (`seeded-meds`, `planner`, `plans`, `sessions` services) never projected a fixed
field set at all, so there was nothing safe to derive — **custom `searchFields` is now
disabled on those four rather than guessed at.** This is a real, if narrow, behavior
change: if client-side search-by-field was actually relied on there (most plausibly
`seeded-meds` search-by-medication-name), restoring it is a one-line fix — add the
intended field(s) as the second argument to `generateFilter`, e.g.
`generateFilter(query, 'name')` — once someone confirms that's an intended feature rather
than a happy accident of the unrestricted original code.

Also capped `pageSize` (`@Max(100)`) and `page` (`@Max(100_000)`) on
`PaginationRequestDto`, which were `@Min(1)` with no ceiling.

**Not touched:** `orderBy`/`buildSortObject` still takes the raw client field name as a
sort key. Left as-is — the audit itself calls this "a lesser concern" (ordering
inference and slow unindexed scans, not an injection vector, since the sort direction is
always a hardcoded ±1), and unlike `searchFields` there's no PII-oracle shape to it.

### Notes — 2.8 (AI cross-tenant write)

All 7 memory-scribe tools (adherence log/pattern, chronic condition, concern,
medication, patient, vital history) plus the notification upsert path share the same
shape: every `filters.userId`/`filters.patient` value is chosen by the model from the
patient's free-text chat message, then flows untouched into `findOneAndUpdate(filters,
..., {upsert: true})`. A prompt injection in that chat message was a straight line to
writing into another patient's medications, vitals, chronic conditions, or notification
schedules.

Fixed at the single choke point where the real identity is available and trustworthy:
`MemoryScribeService.memorize()` already has `state.user.userId`/`state.user.patientId`
(the authenticated caller, established earlier in the same conversation graph). After
the model responds with its proposed tool calls but *before* `toolNode.invoke()` ever
executes them, every tool call's `args.filters.userId`/`.patient` is unconditionally
overwritten with the trusted values — regardless of whatever the model put there. This
covers all 7 tools uniformly without touching each tool's `func`, each `@OnEvent`
handler, or each `upsertX` service method individually (8+ files), and it structurally
can't be bypassed by a cleverer prompt, since the model's values are never consulted at
all for these two fields.

**Related, not fixed here:** while reading this file, confirmed 6.6 is still live in the
same 8 `@OnEvent` handlers — `return this.xService.upsertX(...)` inside a `try` block
doesn't let the `catch` observe a rejection (the bare `return` hands back the promise
before the block's execution window ends; only `return await` would let `catch` see it).
Separate issue from 2.8 (this is about swallowed persistence errors going unlogged, not
authorization), left for its own pass.

### Notes — 2.9 (credential/JWT logging, generic error leak)

`AuthService.login()`/`findAll()` — the pair that concatenated `${email} ${password}`
into a fake "token" and logged it — turned out to be dead code: no controller route
calls either one (real personnel login goes through `ChronicCareAuthService.login()`;
real patient auth goes through Firebase). Deleted both outright rather than patch
unreachable code. `signToken()`'s `console.log('payload', payload)` was live, though —
it fired on every real personnel login/signup and logged `{role, email, facility}` to
stdout unguarded (not even behind a `NODE_ENV` check). Removed.

`throwError()`'s fallback branch (`common/dto/error.dto.ts`) sent `error.message`
straight into the client-facing `InternalServerErrorException` for any error that
wasn't a recognized Mongo/Mongoose/Http error — a raw `TypeError`, DB connection error,
or third-party SDK error text would land in the 500 response body. The full detail was
already captured server-side via the preceding `logger.error(...)` call, so the
client-facing message is now a fixed `'An unexpected error occured'`, with server-side
logging untouched.

**Bucketed under 2.5 instead of fixed here (per product decision):** two unauthenticated
debug routes on `AuthController` — `GET /auth/test` (writes to a hardcoded Firestore
doc) and `POST /auth` (`testNotification`, sends an arbitrary FCM push to any token
supplied in the body). Left alongside 2.5's other still-open debug-scaffolding items.

### Notes — 2.10 (JWT audience/issuer, revocation)

`verifyChronicCareToken()` called `jwtService.verifyAsync(token)` with no options —
`signToken()` puts `audience`/`issuer` claims into every chronic-care JWT, but nothing
downstream ever checked them, so they were purely decorative. Now verifies both,
using the same `UserType.CHRONIC_CARE` audience and `JWT_TOKEN_ISSUER` config value
used at sign time.

The audit's claim that `JWT_TOKEN_ISSUER` is missing from `.envrc.example` is stale —
it's present. It *is* missing from the actual local `.envrc` in this environment, which
means locally-issued tokens currently sign with `issuer: undefined`; `jsonwebtoken`
skips the issuer check entirely when the verify option is unset, so this doesn't break
local login, it just means the issuer check isn't doing real work here yet. That's a
personal `.envrc` addition, not a code change — flagging for the next `direnv` touch,
not fixed in this repo.

No revocation path was the bigger gap: `deletePersonnel()` removed the DB records but
never invalidated the personnel's existing tokens, which stayed valid for up to their
full 24h lifetime after deletion since `verifyChronicCareToken` never re-checked the DB.
Closed with a Redis-backed denylist via the existing `CacheService`: `AuthService` now
exposes `revokePersonnelTokens(personnelId)`, which writes
`chronic-care-token-revoked:{personnelId} = Date.now()` with a 24h TTL (matching the
JwtModule's `signOptions.expiresIn`). `verifyChronicCareToken` checks this key against
the token's `iat` claim and rejects any token issued before the recorded revocation —
covering every outstanding token/device for that personnel in one write, not just a
single token/session. `deletePersonnel()` now calls it after the delete completes. The
denylist entry self-expires via Redis TTL once every token it could have covered has
naturally expired, so there's no manual cleanup path needed.

## Data integrity (§6)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 6.3 | Mass assignment: `CreateVitalHistoryDto.vitals` array has no `@ValidateNested()`/`@Type()` — nested keys bypass whitelist entirely | `create.dto.ts:76-78`; `vital-histories.service.ts:132-141` | Critical | **Resolved** — see notes below |
| 6.1 | Non-atomic `deleteMany`+`insertMany` with no session/transaction; malformed cluster still returns 200 success | `vital-histories.service.ts:426-465` | High | **Resolved** — see notes below |
| 6.2 | `deleteMany` result object always truthy — deleting a nonexistent cluster returns success | `vital-histories.service.ts:467-476` | Medium | **Resolved (already superseded)** — see notes below |
| 6.4 | `$or:[{userId},{patient:userId}]` compares ObjectId path against Firebase string ID — silently never matches in aggregations, throws unhandled `CastError`→500 in query methods | `:486,581,650,732,849,636-638,765,866-869,714-716` | High | **Resolved** — see notes below |
| 6.5 | Unanchored, unescaped `new RegExp(filters.name)` in medication upsert; vital-history identity filter has no `recordedAt` component | `medications.service.ts:125`; `vital-history.schema.ts:122-131` | High | **Resolved** — see notes below |
| 6.6 | 8 AI event handlers `return` before awaiting persistence — errors unobservable; tool generates its own disconnected ObjectId | `memory-scribe.service.ts:241-341` | Medium | **Resolved** — see notes below |
| 6.7 | Medication count query crashes 500 for zero-medication patients; `PORT` `??` doesn't catch `NaN`; `email` has no unique index; `referralCode` generator ignores its args and has no collision retry | `medications.service.ts:405-406`; `main.ts:10`; `personnel.entity.ts:30-31,45-48`; `code-generator.helper.ts:1-5` | Medium/High | **Resolved** — see notes below |

### Notes — 6.3 (mass assignment in vitals)

`CreateVitalHistoryDto.vitals` had only `@IsArray()`/`@IsNotEmpty()` — without
`@ValidateNested({each:true})` + `@Type(() => VitalHistoryInputDto)`, class-transformer
never instantiated each array element, so the global `ValidationPipe`'s `whitelist:
true` never inspected them and every key a client put in a `vitals[i]` object survived
untouched. That mattered concretely in `vital-histories.service.ts`'s `create()`/
`update()`: both spread `...vital` *last* into an object that had already set
`createdBy`, `patient`, `userId`, `clusterId`, `_id` from trusted server-side values —
an unvalidated `vital.createdBy` would silently overwrite the real one, letting a
personnel spoof another personnel as the record's author and defeat the 2.3 ownership
checks entirely. Fixed by adding both decorators; `whitelist: true` now correctly
restricts each element to `{vitalType, value, unit, severity}`, none of which collide
with the protected field names, so this alone closes both the `create()` and `update()`
paths (the latter reuses the same DTO via `PartialType(OmitType(...))`).

### Notes — 6.1 (non-atomic delete+insert) and 6.2 (stale, superseded)

**6.2 was already resolved as a side effect of the 2.3 ownership-check work earlier in
this pass.** The audit's complaint — `remove()` calling `deleteMany` without checking
whether anything existed first — no longer applies: `remove()` now does `findOne` and
throws `NotFoundException` before ever calling `deleteMany`, so a nonexistent cluster
already 404s. No further change made.

**6.1 required a different fix than a straight port of "add a transaction."** Staging
and production both run standalone (non-replica-set) MongoDB, which rejects
multi-document transactions outright — `session.startTransaction()` would simply fail
in those environments. Instead, `update()`'s `vitals` branch was redesigned around
per-vitalType upserts: each incoming vital is `updateOne`'d by its natural key
`(clusterId, vitalType)` with `upsert: true`, which MongoDB guarantees atomic on a
single document without needing a transaction. An existing vitalType updates in place
(keeping its `_id`/`createdAt`); a new one gets inserted. Only after all upserts
complete does a `deleteMany({clusterId, vitalType: {$nin: keptTypes}})` clean up any
vitalType no longer present in the new set. This means there's never a window where the
cluster has zero documents (the actual data-loss risk in the old delete-then-insert
code), and the worst-case failure mode is a stale leftover vitalType — recoverable, not
data loss. Also removed the old bare `catch { insertMany(clusterVitalHistory) }` "rollback"
that silently swallowed errors and still returned success (the literal "malformed
cluster still returns 200" bug) — failures now propagate to `throwError()` for a real
error response.

### Notes — 6.4 (ObjectId/string comparison)

Traced every caller of the 8 affected methods (`client.service.ts`, `hcp.service.ts`) —
in every call path, the `userId` argument passed in is the patient's Firebase string
UID, never the `Patient` document's Mongo `_id`. Since the schema's `patient` field is
an `ObjectId` foreign key while `userId` is a plain `String`, `{patient: userId}` can
never legitimately match in any call path — confirmed by exhaustive caller analysis, not
just in theory. In aggregation pipelines this silently contributed zero matches (Mongoose
doesn't auto-cast `$match` filter values); in regular query-builder calls
(`updateVitalLog`'s `findOneAndUpdate`) it threw a `CastError` since Mongoose does cast
there. Removed the dead `{patient: userId}` disjunct from all 8 occurrences, leaving
just `{userId}` — no loss of matching behavior since that branch never matched anything.

### Notes — 6.5 (unanchored regex, missing recordedAt)

**Medication upsert regex**: even after the 2.7 escaping fix, `new RegExp(escapeRegExp(filters.name), 'i')`
was still a substring match. It only runs as a fallback when the vector-search lookup
finds nothing, feeding straight into `findOneAndUpdate(..., {upsert: true})` — a partial
AI-extracted name like `"Met"` could match and silently overwrite an existing
`"Metformin"` record with unrelated dosage data. Anchored it:
`` new RegExp(`^${escapeRegExp(filters.name)}$`, 'i') `` — appropriate since this is a
last-resort exact-match path beneath the real semantic search, not a partial-match search.

**Vital-history AI identity filter**: `VitalHistoryIdentitySchema` was
`{userId, patient, vitalType, value}` — no time component, so two identical readings
(e.g. a recurring "120/80" blood pressure) logged on different days would collide and
silently overwrite each other via `upsertVitalHistory`'s `findOneAndUpdate(..., {upsert:
true})`. Per product decision, replaced `value` with `recordedAt` in the identity
schema rather than just adding `recordedAt` alongside `value` — the latter would still
collide on same-day identical readings, and matching identity *on* the value you might
be trying to correct doesn't support the presumed use case (the AI correcting a
just-logged reading's value within the same conversation). Identity is now pinned to
the specific recorded event by exact timestamp; `value` is purely mutable data.

### Notes — 6.6 (swallowed AI persistence errors, fabricated ObjectId)

Both bugs identified in the 2.8 pass were fixed here. **Swallowed errors**: all 8
`@OnEvent` handlers did `return this.xService.upsertX(filters, data)` inside a `try`
block — a bare `return <promise>`, not `return await <promise>`, which means a later
rejection is never seen by the local `catch` (the `try` block has already exited by the
time the promise settles). Since `EventEmitter2.emit()` is fire-and-forget (not
`emitAsync()`), nothing else was awaiting that promise either — persistence failures
became silent, unlogged unhandled rejections. Changed all 8 to `await`, so the existing
`logger.error(...)` calls in each `catch` actually fire now. **Fabricated ObjectId**:
each tool's `func` generated its own `new Types.ObjectId()` and returned it as the
"created" ID — completely disconnected from whatever the DB actually assigns via the
fire-and-forget event handler. Traced where that returned value goes: `memorize()`
passes `toolNode.invoke()`'s result only to a `console.log`, nothing downstream (no
further LLM turn, no other tool call) ever consumes it. Since it's provably dead output,
replaced it with a plain `'queued'` acknowledgment string across all 8 tools rather than
returning a misleading fake ID.

### Notes — 6.7 (count crash, PORT NaN, email uniqueness, code generation)

**Medication count crash**: `countBySchedules()` called `delete result[0]._id` before
checking whether `result[0]` existed. Mongo's `$group` emits nothing at all when zero
documents match the preceding `$match`, so a patient with no medications yet got
`result = []`, `result[0] === undefined`, and the `delete` threw. Reordered the guard
before the `delete`.

**`PORT` NaN**: `parseInt(process.env.PORT as string) ?? 4815` — `??` only falls back on
`null`/`undefined`, not `NaN`, so a missing/non-numeric `PORT` left `PORT` as `NaN`.
Replaced with an explicit `Number.isNaN` check.

**Email uniqueness**: `Personnel` no longer even has an `email` field (moved to
`PersonnelAccount` earlier in this pass) — the audit's file reference is stale, but the
underlying gap was real: `PersonnelAccount.email` had no index at all, and
`ChronicCareAuthService.create()` unconditionally creates a new `PersonnelAccount` row
every call regardless of whether one already exists for that email+provider, so nothing
stopped duplicate account rows from being created (e.g. under concurrent signups), which
would make `login()`'s `findOne({provider, email})` resolve arbitrarily. Per product
decision, added a compound unique index on `{email, provider}` (not email alone) — a
person may hold a separate EMAIL-password account and GOOGLE account under the same
email, but never two accounts of the same provider for the same email.

**Code generation**: `generateCode(_prefix?, _name?)` silently discarded both arguments
it was called with (`personnel.entity.ts` passed `'CCREF'`/the personnel's name;
`client.service.ts` passed `'ZC'`/the patient's name), returning an unrelated random
8-char hex string instead. Per product decision, rather than making the function
actually use those arguments, its now-unused parameters were removed entirely
(`generateCode()`, no args) and the 2 call sites that were passing arguments were
updated to call it bare — its implementation (a random 8-char slice of a UUID) is
unchanged. Separately, no caller ever checked for collisions: `Personnel.referralCode`
already had `unique: true` at the schema level, so a collision would fail the entire
signup with a confusing "forbidden: referralCode" 400 rather than corrupting data — bad
UX for an internal random-generation fluke, but not silent. `Patient.patientCode` had no
uniqueness constraint at all, so a collision there would have silently created two
patients sharing the same code. Fixed both: added `unique: true` to `Patient.patientCode`,
added a bounded (5-attempt) collision-check-then-generate retry loop directly in
`PersonnelSchema`'s pre-save hook (checking `this.constructor.exists({referralCode})`
before accepting a candidate), and added an equivalent `generateUniquePatientCode()`
helper in `PatientsService`, now used by all three patient-creation paths (`create()`,
`createByPersonnel()`, `createPatient()` — the last of which `client.service.ts` used to
pre-generate a code for and pass in; that generation was removed from `client.service.ts`
in favor of letting `createPatient()` generate it internally, so there's one source of
truth for patient-code collision-avoidance instead of three).

`generateAnotherCode()` (a second, unused function in the same file that already did
prefix+initials+random-digit formatting correctly) was left untouched — out of scope
once `generateCode()`'s fix path changed to "drop the arguments" rather than "port this
logic in."

## Notification & reminder engine (§5)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 5.1 | Three reachable **infinite loops** in cron generation (WEEKLY ≥8, MONTHLY ≥31, YEARLY ≥13) — no upper bound anywhere; reachable from patient chat parsing. Highest-severity availability finding | `notifications.service.ts:414,423,432`; `notification.schema.ts:45-50`; `notification.dto.ts:73-74`; `notification.entity.ts:16-17` | Critical | **Resolved** — see notes below |
| 5.2 | Incorrect dose-count math for `DAILY` with `repeatEvery > 1` | `notifications.service.ts` (getCron DAILY branch) | High | **Resolved** — see notes below |
| 5.3 | `EVERY_SECOND`/`EVERY_MINUTE` repetition types unguarded and reachable from the model | `notification.dto.ts:57-58`; `notification.schema.ts:22-31`; `consumer.ts:53,248` | High | **Resolved** — see notes below |
| 5.4 | Cron read via `getUTC*()` while repeat option specifies `tz:'Africa/Accra'` — only coincidentally correct; per-notification timezone field never read | `notifications.service.ts:385-390,315`; `notification.entity.ts:144-148` | Medium | **Resolved** — see notes below |
| 5.5 | Schedule start time subtracted by 12 hours but cron pattern built from unmodified date — meds can fire up to 9 hours early | `notifications.service.ts:316-319`; `medications.service.ts:75-78,294-297` | High | **Resolved (already superseded by 5.2)** — see notes below |
| 5.6 | Multi-device push structurally impossible — token upsert keyed on unique `userId`; sign-out on any device deletes the user's only token | `user-tokens.entity.ts:17`; `push.service.ts:24-40,183-185` | Medium | **Resolved** — see notes below |
| 5.7 | `repeatEvery` means "doses/day" in three places and "interval in days" in a fourth — indexing/description bugs follow | `medications.service.ts:88,165,184,306-311` | High | **Resolved** — see notes below |
| 7.3 | Notification queue lookup misses scheduler-backed jobs, falls through to unpaginated fetch + linear search on every write; purge is serial with Redis churn from 7.1 | `notifications.service.ts:335-375`; `medications.service.ts:63` | Medium | **Resolved** — see notes below |

### Notes — 5.1 (infinite loops in cron generation)

All three loops (`getCron()`'s WEEKLY/MONTHLY/YEARLY branches) shared the same root
cause: each computes a step interval via `Math.floor(N / repeatEvery)`, which floors to
`0` once `repeatEvery` exceeds `N` (7/30.4375/12 respectively), turning the loop's `+=`
into a no-op — an infinite loop that hangs the single-threaded Node event loop for every
user, not just the caller. `Frequency.repeatEvery` had no upper bound in either the REST
DTO (`@IsNumber()` only) or the AI-facing Zod schema (`z.number().optional()`, fed
directly from patient chat text via the memory-scribe's notification-upsert tool) — a
single patient chat message could reach this. Fixed at both layers: `Math.max(1, ...)`
guards on all three interval computations (the actual crash fix — bounds every loop to
at most 7/31/12 iterations regardless of input), plus `@Min(1)/@Max(365)` on the DTO and
`.int().min(1).max(365)` on the Zod schema (rejects pathological values as bad input,
defense in depth beneath the now-unconditional loop guard).

### Notes — 5.2 (DAILY dose-count math)

`getCron()`'s DAILY branch encoded multi-dose spacing as a cron step pattern
(`hour/intervalHours`), which cron interprets across the full 24-hour day regardless of
the intended 12-hour dosing window — `repeatEvery: 3` (interval 6h) fired 4×/day, not 3;
`repeatEvery: 4` (interval 4h) fired 6×/day, 50% more than prescribed. Replaced with an
explicit list of exactly `repeatEvery` hour values (the same pattern already used for
WEEKLY/MONTHLY/YEARLY), guaranteeing the exact count regardless of the value.

### Notes — 5.3 (sub-minute repetition types)

`EVERY_SECOND`/`EVERY_MINUTE` were fully wired end-to-end — reachable from the AI
notification-upsert tool (Zod schema, "directly parsed from patient statements"), and
each firing of a `'notify'` job triggers a real LLM API call
(`notifications.consumer.ts`'s `notifyPatient()`) plus a push send. A patient chat
message interpreted as `repetitionType: 'everySecond'` would create a BullMQ repeatable
job firing roughly every second, forever — real LLM billing cost, notification spam, and
risk of the app getting rate-limited by the LLM/push provider. No legitimate product use
case exists for sub-minute reminders in a chronic-care app, so removed both values
entirely (REST enum, AI Zod enum, and the now-dead branches in `getCron()` and
`buildRepeatEvery()`) rather than just gating the AI path.

### Notes — 5.4 (hardcoded timezone, UTC-based cron extraction)

Two compounding bugs, both needed to fix together. `addJob()` hardcoded
`repeatOpts.tz: 'Africa/Accra'` even though `AugurNotification.timezone` already exists
as a per-document field (default `'Africa/Accra'`) — `upsertJob()` was building the
object passed to `addJob()` from only `{startDate, frequency, endDate}`, dropping
`timezone` before it reached there. Separately, `getCron()` extracted hour/min/sec/etc.
via `getUTC*()` — raw UTC components, not components in the notification's actual
timezone. This only "worked" by coincidence because Ghana (`Africa/Accra`) is UTC+0;
fixing only the `tz` option without also fixing the UTC extraction would have made
things *worse* for any non-Ghana patient — BullMQ would then correctly interpret the
pattern's hour field as being in their real timezone, but that field would still hold
the UTC hour, not their local hour. Added the `date-fns-tz` dependency (`pnpm add`, per
explicit instruction — no existing timezone-conversion library in this project) and
used `toZonedTime()` to extract cron fields in the notification's actual timezone,
threading `timezone` through `upsertJob()` → `addJob()` → `getCron()`.

### Notes — 5.5 (early-firing meds — resolved by 5.2, verified empirically)

Same root cause as 5.2, not an independent bug. BullMQ's `getNextMillis()` uses
`repeatOpts.startDate` as the cron search-start point *only* when it's later than "now,"
and `cron-parser`'s `.next()` is exclusive of that point — which is *why* the code
subtracts 12 hours before setting `repeatOpts.startDate` (so the exclusive-boundary
search doesn't skip past the intended first dose). That part was already correct. The
actual bug: the *old* step-based DAILY pattern (fixed in 5.2) could generate phantom
dose-hours falling inside that 12-hour lookback window, and `.next()` would catch one of
those instead of the real intended time. Verified directly against BullMQ's actual
`cron-parser` dependency (not just read — executed): reproduced a concrete case (dose
created the day before, intended first dose 2am, `repeatEvery: 4`) where the *old*
pattern fired **8 hours early** (matching the audit's "up to 9 hours" almost exactly),
and confirmed the *new* explicit-hour-list pattern from 5.2 produces **0 hours early**
for the identical inputs — the new pattern structurally can't produce phantom hours in
that window since it only ever lists exactly `repeatEvery` hours, all confined to the
intended 12-hour span. Also confirmed `medications.service.ts`'s two cited locations
never exercise this path at all — every medication-driven notification uses
`repeatEvery: 1` (one notification per schedule slot), which was never susceptible to
this bug shape even before the 5.2 fix (a single-hour pattern has nothing else to
accidentally match early). No additional code change made.

### Notes — 5.6 (multi-device push)

`UserToken.userId` had `@Prop({unique: true})` — a unique index on `userId` alone, so
only one `UserToken` document could ever exist per user, globally, regardless of how
many devices they use. `addFcmToken()` upserted by `{userId}` alone, so registering a
new device's token silently overwrote another device's — whichever device logged in
most recently stole all push notifications from the rest. `removeFcmToken()` deleted by
`{$or: [{userId}, {fcmToken}]}` — matching on `userId` alone meant signing out on *any
single device* deleted the user's only token, killing push for every device they were
still logged into elsewhere. Notably, the *read* side (`sendAugurNotification`,
`sendNotification`) already assumed multi-device support — both `.find({userId})` and
loop over up to 7 tokens — only the write side was broken. Fixed: compound unique index
on `{userId, fcmToken}` (not `userId` alone), `addFcmToken()` now upserts by
`{userId, fcmToken}` so a new device adds a row instead of overwriting, and
`removeFcmToken()` now requires both `userId` and `fcmToken` to match so sign-out only
removes that specific device's token.

### Notes — 5.7 (repeatEvery semantic collision)

`Frequency.repeatEvery` under `RepetitionType.DAILY` carried two contradictory meanings:
"doses per day" (used by `getCron()`'s DAILY branch, `buildRepeatEvery()`'s DAILY
branch, and both `medications.service.ts` `create()`/`update()`, which set
`repeatEvery: schedules.length`) versus "interval in days" (used by `formatFrequency()`,
consistent with how WEEKLY/MONTHLY/YEARLY genuinely work elsewhere in the same
function). A medication configured for 3 doses/day got described as **"every 3 days"** —
the opposite of reality — and that description flows into the AI's medication summary.
Since the real scheduling logic (which drives actual reminder timing, already fixed for
correctness in 5.1/5.2) is committed to the "doses/day" interpretation for DAILY, fixed
`formatFrequency()` to match it (`"N times a day"` instead of `"every N days"` when
`repetitionType === DAILY && repeatEvery > 1`) rather than redesigning the scheduler —
lowest-risk fix, touches only the description string.

### Notes — 7.3 (notification queue lookup performance)

`removeNotificationJob()`'s fallback path called `getJobSchedulers()` (plural) — a full
Redis `ZRANGE` over every scheduler in the entire queue — then linear-`find()`'d in JS
for the one matching `jobId`. This ran on every notification create/update/delete, so
cost grew with total scheduler count across the whole system, not just the caller's own
notifications. Verified directly against BullMQ's source: `getJobScheduler(id)`
(singular) already exists and runs a single targeted Lua script keyed by the exact ID,
not a scan — and it was already the pattern used elsewhere in this same file
(`upsertJob()`). Swapped the fallback to use it, turning an O(total schedulers) lookup
into O(1). Also parallelized `purgeNotifications()`'s serial `for` loop with
`Promise.allSettled` (matching the resilience pattern already used in the consumer's
`announceActivity()` — one failure shouldn't block the rest).

## Adherence metrics (§4)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 4.1 | Fixed 30-day denominator over a 31-day window — false "CRITICAL" for ~26 days at enrollment; rate can exceed 100% | `adherences.service.ts:96-103,63-71,77` | High | Open |
| 4.2 | Metric is day-based not dose-based — understates ~10x at enrollment, overstates for multi-dose regimens | `adherences.service.ts:82-90` | High | Open |
| 4.3 | Same flaw recurs in two more calculations; one counts future days as missed doses | `adherences.service.ts:285`; `client.service.ts:658-670,694,704` | High | Open |
| 4.4 | Adherence keyed on medication **name**, not ID — renaming orphans history; unanchored/unescaped name regex causes false matches | `client.service.ts:534,552,559,622`; `adherences.service.ts:221` | High | Open |
| 4.5 | No late-confirmation window; timestamp written is scheduled time, not actual | `client.service.ts:522-526,561` | Medium | Open |
| 4.6 | Race condition between duplicate-confirmation check and upsert write; no unique index | `client.service.ts:531-546,548-564`; `adherence-log.entity.ts` | Medium | Open |
| 4.7 | "Never logged" and "actively non-adherent" both map to `CRITICAL` | `determineAdherenceStatus` | Medium | Open |

## Performance (§7, excl. 7.3 above)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 7.1 | Cache-invalidation utility hits Redis on every write across 15 entities, but the only consumer interceptor is never registered — 100% overhead, re-raises on transient faults and fails the originating write | `delete-prefix.util.ts:4-38`; `caching.module.ts:34-37`; `caching.interceptor.ts:52` | High | Open |
| 7.2 | AI service creates 3 unmanaged DB connection pools with no `onModuleDestroy`/`close()`; quadratic re-encoding per model call | `ai.service.ts:52-55,96-108`; `ai-ext.service.ts:24-25`; `planner-ai.service.ts:50-51` | Medium | Open |
| 7.4 | Vital-history count pipeline has no `$match` stage — full collection scan, reports global count as per-patient | `vital-histories.service.ts:562-570` | Medium | Open |
| 7.5 | Unwrapped integer/double coercion on a free-text BP value — unhandled 500 on trends endpoint | `:747-748,853`; `vital-history.dto.ts:76-79` | Medium | Open |

## Backend clinical-logic gaps (§3, server portions)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 3.1 | Server never computes severity — call commented out, method has zero call sites; only a manual clinician-override endpoint writes it | `vital-histories.service.ts:42`, `determineSeverity` (:62-109) | High | Open |
| 3.3 | No hypertensive-crisis or hypotension detection tier reachable server-side | (unreachable server classifier) | Medium | Open |
| 3.6 | `VigilSentinelService` — the safety agent the AI routing prompt explicitly triggers on — is an empty class | `vigil-sentinel.service.ts` | High | Open |

## Dead / scaffold code (§9–10)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 9 | 20 of 21 server test files contain only the generated "service is defined" stub — no coverage of §3–5 subsystems | server test suite | High | Open |
| 10 | `VitalHistoriesController` fully commented out of its module | `vital-histories.module.ts:9,20` | Medium | Open |
| 10 | `Adherences`, `Concerns`, `ChronicConditions`, parts of `Medications` are unmodified scaffolding exposed through unauthenticated controllers | (see §2.5) | Medium | Open |

## Data protection (§11, server-side)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 11 | Patient conversations sent to a third-party LLM with no redaction, consent gate, or data-residency control | `ai.service.ts:181` | High | Open |
| 11 | Notification payloads (goal, target name, patient reference) persisted indefinitely in Redis as job data | `notifications.service.ts:210` | Medium | Open |

---

## Recommended sequence (from audit §12, backend items only)

**Immediate**
1. ~~Remove or authorize `DELETE /client/clean/:userId` (2.1)~~ — done
2. ~~Bound `repeatEvery` at schema/validator/data-layer; remove/gate sub-minute types (5.1, 5.3)~~ — done
3. ~~Require invitation/facility approval for signup; remove email-as-password Google path (2.2, 2.4)~~ — done
4. ~~Remove password/payload logging (2.9)~~ — done
5. ~~Add nested validation to `CreateVitalHistoryDto.vitals`, move spread order (6.3)~~ — done (nested validation alone was sufficient; the allowed vitals keys don't collide with the protected ones, so no spread-order change was needed)

**Within one week**
6. Invert the global auth guard to deny-by-default
7. Add ownership checks to the 4 object-reference routes (2.6); 2.3 done differently than
   originally recommended — see notes above (personnel-identity checks on mutations,
   not facility scoping on reads, per product decision)
8. ~~Remove/allowlist `searchFields`/`orderBy`; escape search expression; cap `pageSize` (2.7)~~ — done (allowlist derived from `.select()`, not `orderBy` — see notes)
9. ~~Fix medication count crash and cast-error query paths (6.4, 6.7)~~ — done

**Subsequent**
10. Single server-side severity scheme, hypertensive-crisis tier, hypotension detection (3.1–3.3)
11. Re-base adherence on scheduled doses, keyed by medication ID, late-confirmation window, unique index (§4)
12. ~~Fix `formatFrequency` (5.7)~~ — done
13. ~~Enforce authenticated user identifier server-side on every AI persistence tool~~ — done (2.8); the 8 event handlers are also done now (6.6)
14. ~~Verify JWT audience/issuer on chronic-care tokens; add a Redis-backed revocation path~~ — done (2.10, not in the audit's original sequence — added because it surfaced while closing 2.9)
15. ~~Replace `deleteMany`+`insertMany` with per-vitalType upserts; drop the dead `patient:userId` filter disjunct; anchor the medication upsert regex; pin vital-history AI identity to `recordedAt`~~ — done (6.1, 6.2, 6.4, 6.5)
16. ~~Fix `PORT` NaN fallback; add email and patient-code uniqueness with collision-retry; drop `generateCode`'s unused params~~ — done (6.7)
17. ~~Fix DAILY dose-count math; fix hardcoded/UTC-only cron timezone handling; fix multi-device push token clobbering; fix notification queue scheduler-lookup performance~~ — done (5.2, 5.4, 5.6, 7.3; 5.5 turned out to already be resolved by 5.2, verified empirically)
