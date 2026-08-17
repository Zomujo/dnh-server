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
| 2.5 | Unauthenticated, DB-backed endpoints: full patient list (paginated + unpaginated), any patient's latest vitals, any patient record, clinical summary SSE, full notification CRUD, med catalogue, debug auth scaffolding | `patients.controller.ts:36-41,93,112,127-132,145`; `notifications.controller.ts:77-176`; `seeded-meds.controller.ts:54`; `main.ts:26` | Critical | **Partially resolved** — see notes below |
| 2.6 | IDOR: patient can rewrite any other patient's medication dosage/times; chat delete filters loosely; bulk "receive-choice" endpoint can falsify any patient's adherence records | `medications.service.ts:253,354`, `client.service.ts:257-269`, `medications.service.ts:239-251` | High | **Resolved** — see notes below |
| 2.7 | `searchFields`/`orderBy` bypass the global validation whitelist → unescaped `RegExp` from client input. ReDoS pre-auth on 4 endpoints; character-by-character oracle can extract Ghana Card/NHIS numbers via the unauthenticated patient list. `pageSize`/`page` unbounded | `pagination-filter.factory.ts:42-50`; `patients.service.ts:277,329`; `notifications.service.ts:76`; `seeded-meds.service.ts:23` | High | **Resolved** — see notes below |
| 2.8 | AI memory-scribe tools accept `{filters, data}` straight from LLM output with `upsert:true`, never compared against the authenticated caller — prompt injection becomes a cross-tenant write | `memory-scribe.service.ts:141-235` | Critical | Open |
| 2.9 | Plaintext passwords logged; JWT payload logged on every signing; generic error handler leaks raw internal error text to clients | `auth.service.ts:75-80,159`; `common/dto/error.dto.ts:52` | High | Open |
| 2.10 | JWT audience/issuer signed but never verified; `JWT_TOKEN_ISSUER` missing from `.envrc.example`; no revocation path for 24h tokens | `auth.service.ts:148-169`; `auth.module.ts:13-21`; `ws-auth.verifier.ts:49` | Low/Medium | Open |

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

**Still open from 2.5:** full notification CRUD (`notifications.controller.ts`),
`seeded-meds.controller.ts`, debug auth scaffolding, and the permissive CORS in `main.ts`.

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

## Data integrity (§6)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 6.3 | Mass assignment: `CreateVitalHistoryDto.vitals` array has no `@ValidateNested()`/`@Type()` — nested keys bypass whitelist entirely | `create.dto.ts:76-78`; `vital-histories.service.ts:132-141` | Critical | Open |
| 6.1 | Non-atomic `deleteMany`+`insertMany` with no session/transaction; malformed cluster still returns 200 success | `vital-histories.service.ts:426-465` | High | Open |
| 6.2 | `deleteMany` result object always truthy — deleting a nonexistent cluster returns success | `vital-histories.service.ts:467-476` | Medium | Open |
| 6.4 | `$or:[{userId},{patient:userId}]` compares ObjectId path against Firebase string ID — silently never matches in aggregations, throws unhandled `CastError`→500 in query methods | `:486,581,650,732,849,636-638,765,866-869,714-716` | High | Open |
| 6.5 | Unanchored, unescaped `new RegExp(filters.name)` in medication upsert; vital-history identity filter has no `recordedAt` component | `medications.service.ts:125`; `vital-history.schema.ts:122-131` | High | **Partially resolved** — the injection/ReDoS half is fixed (see 2.7 notes); still unanchored ("Met" matches "Metformin") and the `recordedAt` gap is untouched |
| 6.6 | 8 AI event handlers `return` before awaiting persistence — errors unobservable; tool generates its own disconnected ObjectId | `memory-scribe.service.ts:241-341` | Medium | Open |
| 6.7 | Medication count query crashes 500 for zero-medication patients; `PORT` `??` doesn't catch `NaN`; `email` has no unique index; `referralCode` generator ignores its args and has no collision retry | `medications.service.ts:405-406`; `main.ts:10`; `personnel.entity.ts:30-31,45-48`; `code-generator.helper.ts:1-5` | Medium/High | Open |

## Notification & reminder engine (§5)

| # | Issue | Location | Severity | Status |
|---|---|---|---|---|
| 5.1 | Three reachable **infinite loops** in cron generation (WEEKLY ≥8, MONTHLY ≥31, YEARLY ≥13) — no upper bound anywhere; reachable from patient chat parsing. Highest-severity availability finding | `notifications.service.ts:414,423,432`; `notification.schema.ts:45-50`; `notification.dto.ts:73-74`; `notification.entity.ts:16-17` | Critical | Open |
| 5.2 | Incorrect dose-count math for `DAILY` with `repeatEvery > 1` | `notifications.service.ts` (getCron DAILY branch) | High | Open |
| 5.3 | `EVERY_SECOND`/`EVERY_MINUTE` repetition types unguarded and reachable from the model | `notification.dto.ts:57-58`; `notification.schema.ts:22-31`; `consumer.ts:53,248` | High | Open |
| 5.4 | Cron read via `getUTC*()` while repeat option specifies `tz:'Africa/Accra'` — only coincidentally correct; per-notification timezone field never read | `notifications.service.ts:385-390,315`; `notification.entity.ts:144-148` | Medium | Open |
| 5.5 | Schedule start time subtracted by 12 hours but cron pattern built from unmodified date — meds can fire up to 9 hours early | `notifications.service.ts:316-319`; `medications.service.ts:75-78,294-297` | High | Open |
| 5.6 | Multi-device push structurally impossible — token upsert keyed on unique `userId`; sign-out on any device deletes the user's only token | `user-tokens.entity.ts:17`; `push.service.ts:24-40,183-185` | Medium | Open |
| 5.7 | `repeatEvery` means "doses/day" in three places and "interval in days" in a fourth — indexing/description bugs follow | `medications.service.ts:88,165,184,306-311` | High | Open |
| 7.3 | Notification queue lookup misses scheduler-backed jobs, falls through to unpaginated fetch + linear search on every write; purge is serial with Redis churn from 7.1 | `notifications.service.ts:335-375`; `medications.service.ts:63` | Medium | Open |

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
2. Bound `repeatEvery` at schema/validator/data-layer; remove/gate sub-minute types (5.1, 5.3)
3. Require invitation/facility approval for signup; remove email-as-password Google path (2.2, 2.4)
4. Remove password/payload logging (2.9)
5. Add nested validation to `CreateVitalHistoryDto.vitals`, move spread order (6.3)

**Within one week**
6. Invert the global auth guard to deny-by-default
7. Add ownership checks to the 4 object-reference routes (2.6); 2.3 done differently than
   originally recommended — see notes above (personnel-identity checks on mutations,
   not facility scoping on reads, per product decision)
8. ~~Remove/allowlist `searchFields`/`orderBy`; escape search expression; cap `pageSize` (2.7)~~ — done (allowlist derived from `.select()`, not `orderBy` — see notes)
9. Fix medication count crash and cast-error query paths (6.4, 6.7)

**Subsequent**
10. Single server-side severity scheme, hypertensive-crisis tier, hypotension detection (3.1–3.3)
11. Re-base adherence on scheduled doses, keyed by medication ID, late-confirmation window, unique index (§4)
12. Fix `formatFrequency` (5.7)
13. Enforce authenticated user identifier server-side on every AI persistence tool; await the 8 event handlers (2.8, 6.6)
