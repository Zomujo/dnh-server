# Data protection: Ghana Data Protection Act, 2012 (Act 843)

This document describes how the Yelima API (`dnh-server`) handles personal data, how it
supports the obligations of the Data Protection Act, 2012 (Act 843), and what Ghana Health
Service (GHS) must do as the **data controller** once it hosts the system.

It is engineering guidance written from the code, not legal advice. Section numbers are
given only where we are confident of them; GHS's legal/data-protection staff and the Data
Protection Commission (DPC) are the authority on how the Act applies.

Contents:

1. [Summary](#1-summary)
2. [Roles](#2-roles)
3. [Data inventory](#3-data-inventory)
4. [Third-party processors](#4-third-party-processors)
5. [Lawful basis and consent](#5-lawful-basis-and-consent)
6. [Data subject rights: procedures and endpoints](#6-data-subject-rights-procedures-and-endpoints)
7. [Security safeguards](#7-security-safeguards)
8. [Retention](#8-retention)
9. [Breach response outline](#9-breach-response-outline)
10. [Gap analysis against the Act's principles](#10-gap-analysis-against-the-acts-principles)
11. [Checklist for GHS (organisational items)](#11-checklist-for-ghs-organisational-items)
12. [What the apps must change](#12-what-the-apps-must-change)

---

## 1. Summary

Yelima processes **health data** (diagnoses, blood pressure and blood sugar readings,
medications, adherence, symptoms) about identifiable patients. Health data is *special
personal data* under the Act (sections 37 onwards), which in general may only be processed
with the data subject's consent or under one of the Act's specific justifications (for
example, processing by a health professional for medical purposes under a duty of
confidentiality). GHS should confirm with the DPC which basis it relies on (see
[section 5](#5-lawful-basis-and-consent)).

What the code now provides:

| Need | Status |
|---|---|
| Record consent (who, when, which notice, which channel), and withdrawal | **Added** in this change: `consent` / `consentHistory` on the patient record, `GET`/`PUT /client/consent`, optional `consent` on onboarding and on clinician registration |
| Right of access / portability | **Added**: `GET /client/data-export` (patient) and `GET /hcp/patients/:id/data-export` (clinician, for patients without the app) |
| Right to correction | Existing: `PATCH /client/patient` (name, gender) and `PATCH /hcp/patients/:id` (all profile fields) |
| Right to erasure | Existing `DELETE /client/clean` (app users; covers every collection, Firestore, Storage and the Firebase Auth user). **Added** `dist/scripts/erase-patient.js` for patients without an app account |
| No personal data in logs | **Fixed**: request logging sent headers (bearer tokens) and bodies (health readings, names, passwords, OTPs) to BetterStack; push, mail and error logs leaked tokens, message content and duplicate-key values. See [section 7](#7-security-safeguards) |
| Audit trail of who accessed what | Separate PR `feat/audit-logs` (`audit_logs` collection: actor, action, route, resource, outcome, IP; no bodies or secrets; TTL `AUDIT_LOG_TTL_DAYS`) |
| Registration with the DPC, data protection supervisor, privacy notice, DPIA, processor agreements, retention schedule | **GHS organisational items**, [section 11](#11-checklist-for-ghs-organisational-items) |

AI features (Gemini, OpenAI, Qdrant) and real-time chat are **retired** and will not be
configured in the GHS deployment. Their code remains (a separate PR makes AI optional).
**Re-enabling any AI feature sends patient data (including names, phone numbers and health
readings) to a third-party LLM provider outside Ghana and would need a new DPIA, an updated
privacy notice, explicit consent and a processor agreement before it is switched on.**

## 2. Roles

| Role under the Act | Who |
|---|---|
| Data controller | Ghana Health Service (decides why and how the data is processed) |
| Data subjects | Patients (diabetes/hypertension) and staff users (clinicians, pharmacy staff) |
| Data processors | Hosting provider, Firebase (Google), Africa's Talking, the SMTP email provider, the log service ([section 4](#4-third-party-processors)) |
| Users with access | Patients (own data only); clinicians and pharmacy staff (patient records, see [section 7](#7-security-safeguards) on access scope); system operators (database/hosting) |

## 3. Data inventory

All MongoDB collections live in the database named by `DB_NAME` on the cluster in
`DB_CONNECTION_STRING`, which GHS hosts. "Erased by" refers to `ClientService.purgePatient`
(`DELETE /client/clean` and the erasure script). "Exported" refers to
`PatientDataExportService`.

### Patients

| Data | Where | Purpose | Exported | Erased by purge |
|---|---|---|---|---|
| Name, gender, date/year of birth, age, phone number, language, timezone, patient code, facility of registration, registering personnel | MongoDB `patients` | Identify the patient, contact them, link USSD sessions (phone number) | yes (`patient`) | yes |
| Ghana Card number, NHIS number | MongoDB `patients` | Identification at a facility. Not collected by the app (onboarding fields are disabled); only clinicians can set them | yes | yes |
| Height, blood type, allergies, smoking/alcohol use, pregnancy status, emergency contact, chronic conditions, adherence rate/status, notes | MongoDB `patients` | Care and monitoring | yes | yes |
| Consent decision and history | MongoDB `patients.consent`, `patients.consentHistory` | Accountability for consent | yes | yes |
| Chronic conditions | `chronicconditions` | Care | yes | yes |
| Medications and dosing schedules (deleted ones kept as history) | `medications` | Reminders, adherence | yes | yes |
| Adherence logs and patterns | `adherencelogs`, `adherencepatterns` | Adherence tracking | yes | yes |
| Vital readings (BP, blood sugar, weight, ...), severity, notes, recording personnel/facility | `vitalhistories` | Monitoring, alerts | yes | yes |
| Symptoms / concerns | `concerns` | Care | yes | yes |
| Appointments and appointment requests | `appointments`, `appointmentrequests` | Scheduling | yes | yes |
| Reminder definitions (target name, schedule, tone) | `augurnotifications`, plus BullMQ jobs in Redis | Reminders | yes (`reminders`) | yes (jobs removed too) |
| Clinical summary (derived from the above) | `summaries`, cached in Redis | Clinician overview | yes (`clinicalSummaries`) | yes |
| Device push tokens | `usertokens` | Push notifications | device list only, without the token | yes |
| Account (email, password hash, uid) | Firebase Authentication | Patient sign-in | no (held by Firebase; GHS can export from the console) | yes |
| Profile mirror (name, phone) and in-app notification feed | Firestore `clients/{uid}` (+ `notifications` subcollection), `users/{uid}` | App display | no (see gap G6) | yes |
| Name and phone (cache, 50 min) | Redis | Request handling | no | yes |
| USSD session (vital type, value, time; 5 min) | Redis `ussd:session:*` | Multi-step USSD entry | no | expires |
| Retired: AI chat messages, AI conversation state, voice notes; chat rooms/messages/media | `clientaichats`, `checkpoints`, `checkpoint_writes`, Firebase Storage, `chatrooms`, `chatmessages` | Not deployed for GHS | AI messages only, when the module is loaded | yes (chat media in Storage: see gap G7) |

### Staff (clinicians and pharmacy users)

| Data | Where | Purpose |
|---|---|---|
| Name, username, phone number, personnel ID number, role, facility, referral code | MongoDB `personnels` | Staff identity and authorisation |
| Login email, password hash (bcrypt), sign-in provider, verification status | MongoDB `personnelaccounts` | Sign-in |
| One-time codes (bcrypt hash, 10 min) | Redis `otp:*` | Sign-in / verification |
| Token revocation markers (24 h) | Redis | Logout / account deletion |

Staff accounts can be deleted through the existing personnel account endpoints, which also
revoke issued tokens.

## 4. Third-party processors

| Processor | What it receives | Notes |
|---|---|---|
| Hosting provider (GHS's choice) | Everything (application, MongoDB, Redis) | Must support encryption at rest and backups under GHS control |
| Google Firebase (GHS's own project) | Patient sign-in (email, password), Firestore profile mirror and notification feed, push notification content (titles/bodies such as a medication name), Storage objects | Data is stored by Google in the region chosen for the project; confirm the region and Google's data processing terms |
| Africa's Talking | Phone numbers and USSD input (vital readings) of patients using USSD; SMS one-time codes to staff | Ghana-operating provider; needs a processor agreement |
| SMTP email provider | Staff email addresses and one-time codes | Choose a provider and sign a processor agreement |
| Log service (BetterStack today, self-hosted OpenObserve planned) | Error/warning/debug lines from the server | After this change, request logs carry only method, route pattern, status and duration. Self-hosting removes this processor |
| Retired: Google Gemini, OpenAI, Qdrant | Nothing while disabled | See the AI note in [section 1](#1-summary) |

The Act applies to processing in Ghana. Several processors store data outside Ghana
(Firebase, BetterStack, possibly the email provider); GHS should confirm with the DPC
whether any additional conditions apply to that transfer and record it in the DPIA.

## 5. Lawful basis and consent

**Decision for GHS:** whether processing rests on the patient's consent, on the
medical-purposes justification for special personal data, or both. The code supports
either by recording consent where it is captured; it does **not** block processing when
consent is missing, so existing app builds and existing patients keep working.

### What is recorded

Each decision is stored as:

```json
{
  "status": "granted | withdrawn",
  "policyVersion": "2026-11",
  "channel": "app | ussd | hcp",
  "recordedAt": "2026-11-19T10:00:00.000Z",
  "recordedBy": "<personnel id, channel hcp only>"
}
```

`patients.consent` holds the current decision; `patients.consentHistory` keeps every
decision in order. `policyVersion` names the privacy notice the patient was shown, so a
later change to the notice can be re-consented.

### How it is captured

| Channel | How |
|---|---|
| App onboarding | `POST /auth/onboard` with optional `"consent": { "policyVersion": "..." }` → granted, channel `app`. A retried onboarding does not add a second record |
| App, later | `PUT /client/consent` with `{ "granted": true \| false, "policyVersion": "..." }`. `GET /client/consent` returns `{ consent, history }` |
| Clinician registers a patient | `POST /hcp/patients` (clinician) or `POST /personnel/pharmacies/patients` (pharmacy) with optional `"consent": { "policyVersion": "..." }` → granted, channel `hcp`, `recordedBy` = the calling personnel |
| Clinician records consent for an existing patient | `PATCH /hcp/patients/:id` with `"consent": { "policyVersion": "..." }` |
| USSD | Not yet: USSD only logs readings for patients already registered (matched by phone number). The `ussd` channel is reserved for a future consent step in the USSD menu |

### Withdrawal

Withdrawal is recorded (`status: withdrawn`) but does not by itself stop processing or
delete anything: erasure is a separate, explicit request (`DELETE /client/clean`). GHS
should decide what withdrawal means operationally (for example, stop reminders, or treat
it as an erasure request) and say so in the privacy notice.

## 6. Data subject rights: procedures and endpoints

| Right | Patient with the app | Patient without the app (USSD / registered at a facility) |
|---|---|---|
| Be informed (openness) | Privacy notice in the app (GHS to write, [section 11](#11-checklist-for-ghs-organisational-items)) | Notice at the facility / on the USSD welcome screen |
| Access and a copy (section 32) | `GET /client/data-export`: one JSON document with the profile and every collection in [section 3](#3-data-inventory) | A clinician calls `GET /hcp/patients/:id/data-export` and gives the patient the file after verifying identity |
| Correction (section 33) | `PATCH /client/patient` (name, gender); other fields via a clinician | Clinician: `PATCH /hcp/patients/:id` |
| Deletion (section 33) | `DELETE /client/clean`: deletes every collection, Firestore records, Storage files and the Firebase Auth user. Safe to repeat after a partial failure | Operator: `node dist/scripts/erase-patient.js <patientCode>` (dry run, prints what is held), then the same with `--confirm` |
| Withdraw consent / object | `PUT /client/consent` with `granted: false` | Clinician records it; GHS procedure decides the follow-up |

Procedure notes for GHS:

- Verify the requester's identity before exporting or erasing (patient code plus a
  second identifier).
- Record each request (who asked, when, what was done, by whom) outside the system, and
  answer within the time the Act / DPC guidance requires.
- Erasure removes the patient's clinical history from Yelima. If GHS must keep a clinical
  record for a statutory period, decide whether to refuse erasure (and on what ground) or
  to keep the record in GHS's main health records system instead.
- Backups still hold erased data until they rotate; state the backup retention in the
  privacy notice.

## 7. Security safeguards

In place (section 28 requires appropriate technical and organisational measures):

- **Authentication:** patients sign in with Firebase; ID tokens are verified with the
  revocation check. Staff use a server-issued JWT with audience/issuer checks and a
  revocation list (logout, account deletion). Staff passwords and one-time codes are
  stored as bcrypt hashes; one-time codes expire after 10 minutes.
- **Authorisation:** every patient route reads only the caller's own records (the user id
  comes from the verified token, never from the request); staff routes require the
  clinician or pharmacy role.
- **Rate limiting** per user / IP, with a tighter limit on sign-up.
- **Input validation:** unknown fields are stripped (rejected on staging); search input is
  escaped (no regex injection or ID-number extraction through search).
- **Storage:** uploaded files have no public download token; they are read through
  short-lived signed URLs.
- **USSD callbacks** are accepted only with the shared secret / from the provider.
- **API docs (Swagger)** are disabled in production; CORS is restricted to listed origins.
- **List endpoints return limited fields:** patient lists return name, date of birth,
  conditions and adherence only (or name and patient code). Ghana Card and NHIS numbers are
  returned only by the single-patient endpoints (`GET /hcp/patients/:id`,
  `GET /personnel/pharmacies/patients/:id`) and to the patient themselves.
- **Logs (fixed in this change):**
  - Request logging (`TelemetryInterceptor`) sent every request's headers, including the
    `Authorization` bearer token, and body (readings, names, phone numbers, passwords,
    OTPs) to BetterStack in every non-development environment. It now logs only the
    method, route pattern (`/hcp/patients/:id`, not the concrete id or query), status and
    duration.
  - Push notifications no longer log device tokens or message content (which can name a
    medication); the mailer logs only the message id, not the SMTP response listing
    recipients; the duplicate-key and invalid-value warnings no longer log the value
    (which could be a phone or ID number); cached user name/phone and AI outputs are no
    longer logged.
  - The clinician summary no longer puts Ghana Card, NHIS or phone numbers into the LLM
    prompt (relevant only if AI is re-enabled).

Gaps and recommendations (technical):

| # | Gap | Recommendation |
|---|---|---|
| G1 | No audit trail of who viewed or changed a patient record | `feat/audit-logs` PR; GHS to decide `AUDIT_LOG_TTL_DAYS` and who reviews the logs |
| G2 | Access scope: facility is deliberately *not* an access boundary. Any clinician can open any patient by id, and any pharmacy user can look a patient up by patient code | Confirm this matches GHS policy in the DPIA. If not, scope reads to the patient's facilities / care team. The audit log makes broad access reviewable |
| G3 | Ghana Card / NHIS numbers and health data rely on database-level encryption at rest | Enable encryption at rest on MongoDB, Redis persistence and backups; restrict operator access; consider field-level encryption for the ID numbers |
| G4 | Error logs can still include whole error objects (for example a database validation error quoting a value) | Self-host the log service (OpenObserve) so logs stay under GHS control, restrict access to it and set a short retention |
| G5 | No automatic retention for clinical data ([section 8](#8-retention)) | Decide a schedule; implement as TTL indexes or a scheduled purge |
| G6 | The data export does not include the Firestore profile mirror or the Firebase Auth record | Both hold only data the patient entered and sees in the app (name, phone, email, notification feed); GHS can export them from the Firebase console on request |
| G7 | Retired chat: deleting chat rooms on erasure does not delete chat media files in Storage (`hcp_chats/...`) | Only relevant if chat is re-enabled; delete room media on erasure first |
| G8 | Patients cannot correct phone number or date of birth themselves | Through a clinician for now. A self-service phone change needs verification, because the phone number links USSD readings to the record |

## 8. Retention

The Act requires that personal data is not kept longer than necessary for the purpose
(section 24), subject to legal requirements to keep records. Current behaviour:

| Data | Kept for |
|---|---|
| Patient record and all clinical collections | Until the patient (or GHS) erases it: **no automatic expiry** |
| Staff records | Until the account is deleted |
| Reminder job history (Redis) | Completed: 7 days or the latest 100; failed: 30 days |
| Missed-dose job history | Latest 48 / 7 runs; failed: 7 days |
| One-time codes | 10 minutes |
| USSD sessions | 5 minutes |
| Name/phone cache | 50 minutes |
| Clinical summary cache | 6 hours |
| Audit log (`feat/audit-logs`) | `AUDIT_LOG_TTL_DAYS` |
| Server logs | Whatever the log service is configured to keep |

Recommendations for GHS to decide and document in a retention schedule:

- Clinical data: align with GHS's medical records retention policy (it is clinical data
  about patients of GHS facilities).
- Inactive accounts: define inactivity (for example no sign-in, reading or appointment for
  N years), notify, then erase or anonymise.
- Server logs: 30 to 90 days. Audit logs: long enough for investigations (often 1 to 2
  years), in line with the audit-log PR's TTL setting.
- Backups: a fixed rotation (for example 30 days) so erased data does not persist
  indefinitely.

## 9. Breach response outline

Section 31 requires the controller to notify the Commission and the affected data subjects
when there are reasonable grounds to believe personal data has been accessed or acquired
by an unauthorised person. GHS should adopt a written procedure; an outline:

1. **Detect and report internally:** anyone (staff, operator, supplier) reports a
   suspected breach to the data protection supervisor immediately.
2. **Contain:** revoke credentials and tokens (staff token revocation; rotate
   `JWT_SECRET`, Firebase service account, database, SMTP and Africa's Talking keys;
   revoke Firebase refresh tokens), close the access path, preserve logs and the audit log.
3. **Assess:** what data, how many patients, which fields (health data, ID numbers), likely
   harm. Use the audit log to identify accessed records.
4. **Notify:** the Data Protection Commission and affected patients as soon as reasonably
   practicable, with what happened, what data, what GHS is doing and what patients should
   do. Processors must notify GHS without delay (put this in the processor agreements).
5. **Recover and learn:** fix the cause, record the incident and the decisions in a breach
   register, review the DPIA.

## 10. Gap analysis against the Act's principles

The Act (section 17) lists eight principles. Status of the system against each:

| Principle | Status | Fixed in code | Remaining (code) | Remaining (GHS) |
|---|---|---|---|---|
| Accountability | Partial | Consent history with who/when; this document | Audit log (separate PR) | DPC registration, data protection supervisor, DPIA, records of requests and breaches |
| Lawfulness of processing (incl. special personal data, consent) | Partial | Consent recording, withdrawal, optional consent on every registration path | USSD consent step; optional enforcement once apps send consent | Choose the lawful basis; privacy notice; staff guidance for capturing consent |
| Specification of purpose | Partial | n/a | n/a | State purposes in the privacy notice (care, reminders, monitoring) |
| Compatibility of further processing | OK while AI is retired | Identifiers removed from the clinician-summary prompt | Keep AI disabled unless re-assessed | New DPIA/consent before any new use (AI, research, analytics) |
| Quality of information | OK | n/a | Self-service phone/DOB correction (G8) | Facility process for corrections |
| Openness | Gap | Data inventory in this document | n/a | Privacy notice in the apps, at facilities and for USSD |
| Data security safeguards | Partial | Personal data and tokens removed from logs | G2 to G4 | Encryption at rest, backups, access control for operators, penetration test, processor agreements |
| Data subject participation | Good | Export endpoints; erasure script for non-app patients | Firestore/Auth in export (G6) | Request-handling procedure and timelines |

## 11. Checklist for GHS (organisational items)

- [ ] **Register with the Data Protection Commission** as data controller for Yelima
      (registration of data controllers, section 46 onwards) and renew as required.
- [ ] **Appoint a data protection supervisor / officer** responsible for Yelima and
      publish how patients can contact them.
- [ ] **Decide the lawful basis** for processing health data (consent and/or the
      medical-purposes justification) and record the decision.
- [ ] **Write the privacy notice** (purposes, data held, processors, retention, rights and
      how to exercise them, contact) and give it a version string; publish it in the
      mobile app, at facilities and in short form on USSD. Use that version as
      `policyVersion`.
- [ ] **Data protection impact assessment (DPIA)** covering health data, the access scope
      (G2), cross-border processors and the retired AI features.
- [ ] **Processor agreements** with the hosting provider, Google (Firebase), Africa's
      Talking, the SMTP email provider and the log service (until it is self-hosted):
      security measures, breach notification to GHS, data location, deletion at end of
      contract, sub-processors.
- [ ] **Retention schedule** ([section 8](#8-retention)) including backups and logs.
- [ ] **Data subject request procedure** (identity checks, who runs the export/erasure,
      response times, request register).
- [ ] **Breach response procedure** and breach register ([section 9](#9-breach-response-outline)).
- [ ] **Staff training and confidentiality undertakings** for clinicians, pharmacy staff
      and operators; joiner/leaver process for staff accounts.
- [ ] **Hosting security:** encryption at rest for MongoDB/Redis/backups, network
      isolation, restricted operator access, secret management, monitoring.
- [ ] **Penetration test** before go-live and after major changes.
- [ ] **Keep AI features disabled** unless a new DPIA, notice update, consent and processor
      agreement are in place.

## 12. What the apps must change

The API changes are backwards compatible: nothing fails if the apps send nothing new.

Mobile app (patients):

- Show the privacy notice during onboarding and send
  `"consent": { "policyVersion": "<notice version>" }` in `POST /auth/onboard`.
- Add a privacy screen: show `GET /client/consent`, let the patient withdraw or re-grant
  with `PUT /client/consent` (`{ "granted": false, "policyVersion": "..." }`), and ask
  existing users (no `consent` on `GET /client/patient`) to accept the current notice.
- Add "Download my data" calling `GET /client/data-export` (returns a JSON document; save
  or share it as a file).
- Keep "Delete my account" on `DELETE /client/clean`.

Web app (clinicians and pharmacy staff):

- When registering a patient (`POST /hcp/patients`, `POST /personnel/pharmacies/patients`),
  add a "patient has agreed to the privacy notice" checkbox and send
  `"consent": { "policyVersion": "..." }` when it is ticked.
- For existing patients, allow recording consent with `PATCH /hcp/patients/:id`
  (`"consent": { "policyVersion": "..." }`); the patient record shows `consent`.
- Add "Export patient data" calling `GET /hcp/patients/:id/data-export`.
