# TASKS.md

## How to Read This File

Checkbox status convention (standard Markdown only supports `[ ]` / `[x]`;
the extra states below are a project-specific convention, not native
Markdown, and are used consistently throughout this file):

- `[ ]` — Not started
- `[x]` — Completed (verified — see each task's verification condition)
- `[~]` — In progress
- `[!]` — Blocked

**Owner tags**, in addition to status, mark who does the task:

- `[HUMAN]` — Requires the person (account creation, clicking through a
  dashboard, providing credentials, recording video, manual sign-off, etc.).
  **Claude Code must not attempt these itself and must not fabricate their
  completion.**
- `[AI]` — Claude Code can execute this directly (writing code, tests,
  config files, running commands it has access to).
- `[AI+HUMAN]` — Claude Code can draft/prepare it, but the human must review
  or take a final action (e.g., approving a deploy, confirming a live URL
  works) before it's marked `[x]`.

**Hard rule for Claude Code:** before starting any `[AI]` task, check whether
it depends on an incomplete `[HUMAN]` task in the same or an earlier phase.
If so, **stop and ask the user to confirm the human task is done** — do not
proceed, skip ahead, or assume/mock the missing input (e.g., do not invent
credentials, do not skip a real API call and hardcode a fake response).

---

## Current Priority

> Build the smallest production-minded solution that proves correctness,
> idempotency, canonical status handling, and metric consistency.

---

## Decisions Made (Decision Log)

- Problem Statement 2 selected.
- PayPal Sandbox chosen as the real finance integration.
- Seeded/mock adapter chosen as the second source.
- Supabase PostgreSQL selected as the database.
- Render selected for deployment.
- Gross captured amount selected as the revenue figure (not net-of-fees).
- Cross-currency totals intentionally unsupported (reject/segment instead).
- Modular monolith selected instead of microservices.
- Unknown statuses excluded from revenue by default (allow-list, not
  exclusion-list).
- PayPal Sandbox flow already verified manually by the human before this
  file was created (OAuth, order creation, buyer approval, capture) —
  see Phase 3.

## Open Questions

- [ ] Do we need any auth on the import endpoints, or is "documented
      trade-off, no auth" acceptable for this assignment? *(default: no
      auth, document as trade-off, unless told otherwise)*
- [ ] Daily vs weekly breakdown as the default `interval` — default to
      `day`, allow `week` as an option.

## Blockers

- [x] `[HUMAN]` Supabase project created / connection string provided in
      `.env`. Confirmed live: connected to PostgreSQL 17.6, migration applied.
      **(Resolved — no longer blocks Phase 1.)**
- [!] `[HUMAN]` Render account/service not yet confirmed created. **Blocks
      Phase 10.**

*(Update this section as blockers are resolved or new ones appear.)*

## Known Trade-offs

- No authentication on import endpoints (documented, not defended as ideal).
- No currency conversion — multi-currency handled by rejection/segmentation,
  not real FX.
- No retry/backoff queue for PayPal import failures beyond basic error
  handling — acceptable given scope and timeline.
- Seeded provider is deterministic/synthetic, not a second real integration
  — a scope trade-off explicitly allowed by the assignment context.

---

## Phase 0 — Project Setup

**Must complete before submission**

- [ ] `[HUMAN]` Confirm PayPal Sandbox developer app credentials (client ID
      + secret) are available and will be provided as env vars.
      *Verification: credentials exist in a password manager / notes, not
      yet in repo.*
- [ ] `[HUMAN]` Create a Supabase project (free tier) and obtain the
      Postgres connection string.
      *Verification: connection string obtained.*
- [ ] `[HUMAN]` Create a Render account (free tier) if not already done.
      *Verification: account exists and can create a new Web Service.*
- [ ] `[HUMAN]` Create a public GitHub repository for this project.
      *Verification: repo exists, empty or initialized.*
- [x] `[AI]` Initialize Node.js + TypeScript project (package.json,
      tsconfig, lint/format config).
      *Verification: `npm run build` succeeds; `npm run lint` exits 0.
      Node pinned to 20 via `.nvmrc` + `engines` (local default was EOL 16).*
- [x] `[AI]` Add `.env.example` listing all required environment variables
      (PayPal client id/secret, Supabase connection string, PORT, etc.).
      *Verification: file present, placeholders only, no real secrets.*
- [x] `[AI]` Add `.gitignore` covering `.env`, `node_modules`, build output.
      *Verification: created a local `.env`; `git add -A -n` did not list
      `.env` (only `.env.example`).*
- [x] `[AI]` Set up Express or Fastify skeleton with `GET /health`.
      *Verification: `curl localhost:3999/health` returned HTTP 200 with
      `{"status":"ok",...}`.*
- [x] `[AI]` Set up Pino structured logging baseline.
      *Verification: startup log emitted as structured JSON
      (`{"level":30,...,"msg":"...service started"}`).*
- [x] `[AI]` Set up Vitest/Jest test runner with one passing smoke test.
      *Verification: `npm test` → 1 passed (tests/health.test.ts).*

Dependencies: Phase 0 human tasks (Supabase, PayPal creds, GitHub, Render
account) block later phases but do not block scaffolding itself.

---

## Phase 1 — Database and Schema

**Must complete before submission**

- [x] `[AI]` Depends on: Supabase connection string from Phase 0 `[HUMAN]`.
      **Resolved — connection string set in `.env`, live connectivity
      verified (PostgreSQL 17.6).**
- [x] `[AI]` Design canonical `transactions` table (fields per CLAUDE.md
      §9–10: id, source, external_id, parent_external_id, amount_minor,
      currency, raw_status, canonical_status, collected_at,
      source_created_at, gross_amount_minor, fee_amount_minor,
      net_amount_minor, raw_payload, created_at, updated_at).
      *Verification: `migrations/0001_init.sql` — all 16 columns confirmed via
      information_schema; money in bigint minor units; currency ISO-4217 check;
      canonical_status closed CHECK set; collected_at only on COLLECTED;
      gross=net+fee reconcile guard. Revenue reads gross_amount_minor only.*
- [x] `[AI]` Add unique constraint on `(source, external_id)`.
      *Verification: `transactions_source_external_unique` present; duplicate
      insert rejected with SQLSTATE 23505 (unique_violation).*
- [x] `[AI]` Apply migration to Supabase instance.
      *Verification: `npm run migrate` applied 0001_init.sql; table + all
      constraints confirmed via live queries against Supabase.*
- [~] `[AI+HUMAN]` Human spot-checks the schema in the Supabase dashboard.
      *Ready for review: open Supabase → Table Editor → `transactions`.
      Awaiting human confirmation before marking [x].*

---

## Phase 2 — Domain Model and Normalization

**Must complete before submission**

- [ ] `[AI]` Define canonical status enum: `COLLECTED`, `PENDING`, `FAILED`,
      `REFUNDED`, `VOIDED`, `UNKNOWN`.
      *Verification: type-checked enum used consistently across codebase.*
- [ ] `[AI]` Define canonical transaction TypeScript type + Zod schema.
      *Verification: schema compiles and validates a sample record.*
- [ ] `[AI]` Implement per-source status allow-list mapping functions
      (PayPal, seeded) returning `UNKNOWN` for anything not explicitly
      listed.
      *Verification: unit test feeds an unrecognized status and asserts
      `UNKNOWN`.*

---

## Phase 3 — PayPal Integration

**Must complete before submission**

- [x] `[HUMAN]` PayPal Sandbox flow manually verified prior to this task
      list: OAuth token, order creation, buyer approval, and capture all
      confirmed working (Order ID `1A876373MX123143G`, Capture ID
      `0F3444274G682183F`, status `COMPLETED`, gross USD 25.00).
      *Verification: already confirmed by human; do not re-verify manually,
      but do use this real captured transaction as a fixture/reference.*
- [ ] `[HUMAN]` Confirm current PayPal Sandbox client ID/secret are valid
      and set as env vars for the running service.
      *Verification: a live OAuth token request from the service succeeds.*
- [ ] `[AI]` Implement PayPal OAuth token fetch (with basic retry/backoff
      on transient failure).
      *Verification: unit/integration test or manual run obtains a token.*
- [ ] `[AI]` Implement `POST /api/import/paypal` to fetch capture(s) and
      normalize into canonical schema, using **capture ID** as
      `external_id` and order ID as `parent_external_id`.
      *Verification: importing the known real capture produces exactly one
      row with `canonical_status = COLLECTED` and gross amount in minor
      units.*
- [ ] `[AI]` Implement PayPal status mapping: only `COMPLETED` ->
      `COLLECTED`; everything else explicitly mapped or `UNKNOWN`.
      *Verification: test with `CREATED`/`APPROVED` asserts not collected.*
- [ ] `[AI]` Store raw PayPal payload in `raw_payload`.
      *Verification: DB row contains full raw JSON.*

---

## Phase 4 — Seeded Second Provider

**Must complete before submission**

- [ ] `[AI]` Design deterministic seeded dataset with distinct field names/
      shape and its own status vocabulary (`paid`, `succeeded`,
      `completed`, `pending`, `failed`, `voided`, `refunded`,
      `unexpected_new_status`).
      *Verification: fixture file reviewed — shape genuinely differs from
      PayPal's.*
- [ ] `[AI]` Implement `POST /api/import/seeded` to normalize seeded data
      into canonical schema using its own explicit allow-list.
      *Verification: `unexpected_new_status` maps to `UNKNOWN` and is
      excluded from revenue in a test.*
- [ ] `[AI]` Confirm seeded import is deterministic (same input -> same
      output every run).
      *Verification: running import twice on a clean DB produces identical
      canonical rows (ids aside).*

---

## Phase 5 — Idempotent Ingestion

**Must complete before submission**

- [ ] `[AI]` Implement upsert-on-conflict logic keyed on
      `(source, external_id)` for both import paths.
      *Verification: re-running `POST /api/import/paypal` and
      `POST /api/import/seeded` twice each results in the same row count
      as running once.*
- [ ] `[AI]` Add test for concurrent duplicate import (e.g., two parallel
      import calls for the same data).
      *Verification: test asserts no duplicate rows and no crash.*

---

## Phase 6 — Revenue Metrics

**Must complete before submission**

- [ ] `[AI]` Implement one canonical revenue query/service function used by
      every metrics endpoint (no duplicated revenue logic anywhere).
      *Verification: code review confirms summary and breakdown both call
      the same function/query module.*
- [ ] `[AI]` Revenue definition: sum of `gross_amount_minor` (or
      `amount_minor` where gross applies) for rows where
      `canonical_status = COLLECTED`, filtered by date range and currency.
      *Verification: unit test with known fixtures matches expected total.*
- [ ] `[AI]` Add a "drift guard" test: assert that summary total always
      equals sum of breakdown totals for a range of test scenarios,
      including after adding a new status/source in test fixtures.
      *Verification: test fails if someone reimplements revenue math a
      second way; currently passes.*

---

## Phase 7 — API Endpoints

**Must complete before submission**

- [ ] `[AI]` `GET /api/transactions` (basic list/filter, for debugging/demo).
      *Verification: returns normalized rows from both sources.*
- [ ] `[AI]` `GET /api/metrics/revenue/summary?from=&to=&currency=`.
      *Verification: returns correct total for known fixture date range.*
- [ ] `[AI]` `GET /api/metrics/revenue/breakdown?from=&to=&currency=&interval=day|week`.
      *Verification: sum of breakdown rows equals summary total for the
      same range.*
- [ ] `[AI]` Zod validation on all query params; invalid date range or
      unsupported/missing currency returns a structured 4xx error.
      *Verification: test hits endpoint with bad input, asserts 4xx with
      clear message, not 500.*

---

## Phase 8 — Tests and Correctness

**Must complete before submission**

- [ ] `[AI]` PayPal `COMPLETED` counts as collected.
- [ ] `[AI]` PayPal `CREATED`/`APPROVED` do not count as collected.
- [ ] `[AI]` Seeded `paid`/`succeeded`/`completed` count only when
      explicitly allow-listed.
- [ ] `[AI]` Seeded `pending`/`failed`/`voided`/`refunded` do not count.
- [ ] `[AI]` Seeded `unexpected_new_status` maps to `UNKNOWN`, excluded.
- [ ] `[AI]` Re-importing same external transaction creates one row only.
- [ ] `[AI]` Concurrent duplicate imports remain idempotent.
- [ ] `[AI]` Summary total equals sum of breakdown totals.
- [ ] `[AI]` New source without a status policy fails safely / maps to
      `UNKNOWN`.
- [ ] `[AI]` Different currencies are not silently combined.
- [ ] `[AI]` Invalid dates are rejected.
- [ ] `[AI]` Date-range boundary behavior is tested (inclusive/exclusive
      edges).
- [ ] `[AI]` Gross amount, not net amount, is used in revenue calculation.

*(Each item above must be an actual passing automated test, not a manual
check, before being marked `[x]`.)*

**Nice to have only if time remains**

- [ ] `[AI]` Basic load/perf sanity check on breakdown endpoint with a
      larger fixture set.

---

## Phase 9 — Observability and Production Readiness

**Must complete before submission**

- [ ] `[AI]` Structured logs for import runs (counts of inserted/skipped/
      duplicate/unknown-status).
      *Verification: log output inspected manually for one run.*
- [ ] `[AI]` Global error handler returns consistent JSON error shape.
      *Verification: triggering an unhandled error path returns structured
      JSON, not a stack trace dump.*

**Nice to have only if time remains**

- [ ] `[AI]` Basic request logging middleware (method, path, status, ms).
- [ ] `[AI]` `/health` includes a DB connectivity check.

---

## Phase 10 — Supabase and Render Deployment

**Must complete before submission**

- [!] `[HUMAN]` Confirm Supabase project connection string is set as an
      env var in Render's environment settings. **Blocks deploy.**
- [!] `[HUMAN]` Confirm PayPal Sandbox credentials are set as env vars in
      Render's environment settings. **Blocks deploy.**
- [ ] `[AI]` Add build/start scripts suitable for Render (e.g.,
      `npm run build` + `npm start`).
      *Verification: builds and starts cleanly locally with production
      env vars set.*
- [ ] `[HUMAN]` Create the Render Web Service, connect the GitHub repo, set
      env vars, deploy.
      *Verification: Render dashboard shows a successful deploy.*
- [ ] `[AI+HUMAN]` Hit the live `/health` endpoint and at least one metrics
      endpoint on the deployed URL.
      *Verification: human confirms real responses from the live URL, not
      localhost.*

---

## Phase 11 — README and Documentation

**Must complete before submission**

- [ ] `[AI]` Write README: setup/local run instructions, env vars needed.
      *Verification: a fresh read-through with no prior context could
      follow it.*
- [ ] `[AI]` Write README: design decisions & trade-offs (pull from
      Decision Log / Known Trade-offs above).
- [ ] `[AI]` Write README: sources & references used.
- [ ] `[HUMAN]` Write/confirm AI usage disclosure section, including how to
      access the shared AI conversation history.
      *Verification: link/export actually accessible, not just described.*
- [ ] `[HUMAN]` Add live deployment URL and example curl commands to README,
      confirmed against the actual deployed instance.

---

## Phase 12 — Demo Preparation

**Must complete before submission**

- [ ] `[HUMAN]` Script the 5-minute demo: what to show, in what order
      (see Demo Script Checklist below).
- [ ] `[HUMAN]` Record demo video (max 5 minutes) against the **live**
      deployment, including at least one failure/edge case (e.g., unknown
      status excluded, or invalid date range rejected).
      *Verification: video recorded, watched back, under 5 minutes.*
- [ ] `[HUMAN]` Upload/host video where required and get a shareable link.

---

## Phase 13 — Final Submission Checklist

**Must complete before submission**

- [ ] `[HUMAN]` Live deployment URL works (health + metrics endpoints).
- [ ] `[HUMAN]` Demo video ≤ 5 minutes, shows a real failure/edge case.
- [ ] `[HUMAN]` GitHub repo is public and pushed with final code.
- [ ] `[HUMAN]` README complete (setup, design decisions/trade-offs,
      sources, AI usage).
- [ ] `[AI]` Automated tests pass in CI (or at least locally, documented).
- [ ] `[HUMAN]` AI conversation history exported/shared per submission
      requirements.
- [ ] `[HUMAN]` Final review: re-read the two problem-statement paragraphs
      and confirm every requirement is addressed.

---

## Final Acceptance Criteria

- Two sources (PayPal Sandbox + seeded) import into one canonical schema.
- Revenue is computed via one canonical query/service, gross amounts only.
- Summary and breakdown endpoints always agree for the same range/currency.
- Unknown or new statuses never count as collected.
- Re-running imports never duplicates rows; concurrent imports are safe.
- Invalid dates/currencies are rejected with clear validation errors.
- Automated tests cover all 13 critical correctness scenarios and pass.
- Service is live on Render, backed by Supabase Postgres.
- README, sources, and AI usage are documented; AI conversation is shared.

## Demo Script Checklist

- [ ] Show live health check against the deployed URL.
- [ ] Run/show the PayPal import (reference the real captured transaction).
- [ ] Run/show the seeded import, highlighting differing shape/vocabulary.
- [ ] Hit summary endpoint, then breakdown endpoint, show totals match.
- [ ] Demonstrate one edge case live: e.g., `unexpected_new_status` excluded,
      or an invalid date range returning a validation error.
- [ ] Briefly mention idempotency: re-run an import, show no duplicates.

## Submission Checklist

- [ ] Live Render URL
- [ ] Demo video (≤ 5 min) link
- [ ] Public GitHub repo link
- [ ] README with setup, trade-offs, sources
- [ ] AI usage disclosure + shared conversation history link