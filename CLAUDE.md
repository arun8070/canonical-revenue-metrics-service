# CLAUDE.md

## 1. Project Purpose

This repository implements the **Canonical Revenue Metrics Service** — a backend
service that ingests normalized transaction data from multiple source systems
(PayPal Sandbox + a deterministic seeded provider) and computes **total
collected revenue** for an arbitrary date range using **one canonical
definition of "collected"**, exposed consistently through two different views
(summary + breakdown).

The core engineering property being demonstrated is: **the same number,
computed the same way, everywhere, forever** — even as new sources or new
statuses are added.

## 2. Assignment Context

This is a take-home engineering assignment (Problem Statement 2: "one metrics
number that never drifts"). It is being evaluated on:

- Correctness of the canonical revenue definition
- Idempotency of ingestion
- Safe handling of unknown/new statuses (allow-list, not exclusion-list)
- Consistency between the summary and breakdown endpoints
- Tests that would catch future drift
- A real deployed, runnable artifact — not just code
- Clear documentation of design decisions, trade-offs, and AI usage

## 3. Deadline Sensitivity

**Submission is due tomorrow, first half of the day.** This is an overnight
build. Prioritize a small, correct, well-tested vertical slice over breadth.
When in doubt, ship the smaller, more defensible thing. Do not start
speculative refactors close to the deadline. Always check `TASKS.md` for the
current priority before picking up new work.

## 4. Scope Boundaries

In scope:
- Two source integrations: PayPal Sandbox (real) + seeded/mock provider (deterministic)
- One normalized transaction schema
- One canonical revenue definition, used by both endpoints
- Idempotent imports
- Automated tests covering correctness, idempotency, and status handling
- Deployment to Render + Supabase Postgres
- README, AI usage documentation, demo video prep

Out of scope (do not build unless explicitly instructed):
- Any UI
- More than two source integrations
- Currency conversion / FX handling
- Multi-tenant auth, RBAC, or user accounts
- Anything not required to prove the correctness properties above

## 5. Architecture Principles

- **Modular monolith**, not microservices. One deployable service, cleanly
  separated by domain folder.
- **One canonical revenue query/service** used by both the summary and
  breakdown endpoints — never two separate SQL queries computing "revenue."
- **Allow-list, not exclusion-list**, for what counts as collected, per source.
- **Adapters are the only place that knows source-specific shapes.** Once data
  crosses into the canonical schema, no code downstream should care which
  source it came from except via the `source` column.
- Favor explicit, boring code over cleverness. This is a correctness
  assignment, not an architecture showcase.

## 6. Coding Conventions

- TypeScript, strict mode on.
- No `any` unless justified with a comment.
- Zod schemas at every external boundary (incoming payloads, query params).
- Pure functions for status normalization and revenue math; keep I/O at the
  edges.
- Small files, small functions. If a file is doing "ingestion" and "money
  math," split it.
- Prefer explicit named exports over default exports.

## 7. Folder Structure Guidance
src/
integrations/
paypal/
seeded-provider/
transactions/
metrics/
database/
routes/
validation/
config/
logging/
tests/

- Each integration folder owns its own payload types, mapping function, and
  status allow-list.
- `metrics/` contains the single canonical revenue query/service used by all
  endpoints.
- `transactions/` owns the canonical schema, insert/upsert logic, and
  idempotency keys.

## 8. Database Rules

- Postgres via Supabase.
- Unique constraint on `(source, external_id)` — this is the idempotency
  boundary. All writes go through an upsert (`ON CONFLICT DO NOTHING` or
  `DO UPDATE` with explicit, reviewed semantics — default to
  `DO NOTHING` unless a field genuinely needs to be refreshed on re-import).
- Store the **raw source payload** (JSONB) on every row for auditability.
- Store both `raw_status` and `canonical_status`.
- Migrations are plain SQL or a lightweight migration tool — no ORM
  migration framework beyond what's strictly needed.

## 9. Money-Handling Rules

- All money is stored and computed in **integer minor units** (e.g., cents).
  Never store or compute money as a float.
- Revenue uses the **gross captured amount**, not the amount net of
  processor fees. For PayPal this means the gross capture amount, not
  `net_amount`.
- Currency is always explicit on every transaction row and every API
  response.
- **Never aggregate across currencies** without an explicit FX policy. If a
  query would mix currencies, either reject it (validation error) or segment
  results by currency — never silently sum them.

## 10. Status-Normalization Rules

- Canonical statuses: `COLLECTED`, `PENDING`, `FAILED`, `REFUNDED`, `VOIDED`,
  `UNKNOWN`.
- Every source has its **own explicit allow-list** mapping raw status ->
  canonical status.
- Any raw status not present in a source's allow-list maps to `UNKNOWN` by
  default. **Unknown statuses never count as collected.** This must be true
  even for statuses that don't exist yet at the time the code is written.
- PayPal: only capture status `COMPLETED` maps to `COLLECTED`.
- Adding a new source without a defined status policy must fail safely
  (reject at validation time) or map everything to `UNKNOWN` — never default
  to counting as collected.

## 11. Idempotency Rules

- Idempotency key is `(source, external_id)`.
- For PayPal, `external_id` is the **capture ID**, not the order ID.
  `parent_external_id` may hold the order ID for traceability.
- Re-running an import (or the same webhook firing twice) must never create
  duplicate rows.
- Concurrent duplicate imports must also be safe — rely on the database
  unique constraint, not application-level locking, as the source of truth.

## 12. API Conventions

- `GET /health`
- `POST /api/import/paypal`
- `POST /api/import/seeded`
- `GET /api/transactions`
- `GET /api/metrics/revenue/summary?from=...&to=...&currency=...`
- `GET /api/metrics/revenue/breakdown?from=...&to=...&currency=...&interval=day|week`
- All endpoints validate query params with Zod; invalid date ranges or
  missing/invalid currency return a structured 4xx validation error, not a
  500 or silent default.
- Both metrics endpoints must call the same underlying canonical revenue
  function/query. This is a hard rule, not a suggestion.

## 13. Testing Requirements

- Vitest or Jest.
- Must cover, at minimum, the 13 "critical correctness tests" listed in
  `TASKS.md` Phase 8.
- Tests must prove: canonical status handling, idempotency (including
  re-import and concurrent import), summary == sum(breakdown), unknown
  statuses excluded, gross-not-net amount used, currency isolation, date
  boundary correctness.
- A task is not "done" until its associated test passes. See Rule 20 below.

## 14. Error-Handling Expectations

- External API failures (PayPal) must be caught and surfaced as structured
  errors, not crash the process.
- Validation errors return 4xx with a clear message; unexpected errors
  return 5xx and are logged with enough context to debug (never swallow
  silently).
- Unknown/new statuses are a normal case to be handled gracefully, not an
  exception path.

## 15. Logging Requirements

- Structured logging via Pino.
- Log at minimum: import start/end with counts (inserted/skipped/duplicate),
  status mapping decisions when a status falls through to `UNKNOWN`, and all
  errors with context.
- No logging of secrets or full raw payloads containing sensitive data at
  info level (raw payload storage in DB is fine; console/log output should
  be scoped).

## 16. Security Rules

- No secrets in code, ever, including test fixtures.
- No unnecessary authentication for this assignment — but the import
  endpoints should not be wide open to abuse if trivially avoidable (e.g., a
  simple shared-secret header is acceptable if quick; otherwise document the
  trade-off in the README instead of building real auth).
- Validate and sanitize all external payloads before they touch the database.

## 17. Environment-Variable Rules

- All secrets and environment-specific config (PayPal client ID/secret,
  Supabase connection string, port, etc.) come from environment variables,
  never hardcoded.
- Provide a `.env.example` with all required keys and placeholder values.
- `.env` is gitignored. Confirm this before the first commit.

## 18. Git Workflow Expectations

- Small, reviewable commits with clear messages describing *what* and *why*.
- Do not squash the whole night's work into one commit.
- Commit after each meaningfully completed task in `TASKS.md`, not before.
- Never commit `.env`, `node_modules`, or credentials.

## 19. README Expectations

The README must include:
- Setup instructions (local run, env vars, how to seed/import data)
- Design decisions and trade-offs (see decision log in `TASKS.md`)
- Sources & references used during research
- AI usage disclosure (this file, `TASKS.md`, and how Claude Code was
  directed and reviewed)
- Live deployment URL and example curl commands for each endpoint

## 20. Deployment Expectations

- Render free tier for the service.
- Supabase Postgres for the database.
- Deployment must be a real, hittable, running instance — not just code that
  "should" deploy.
- Confirm the live health endpoint and at least one metrics endpoint work
  against the deployed instance before considering deployment done.

## 21. AI-Use Documentation Requirements

- Every meaningful AI-assisted step should be traceable: what was asked, what
  was generated, what was changed/reviewed by hand.
- The AI conversation history must be exportable/shareable per the
  assignment's submission requirements. Do not rely on memory to reconstruct
  this after the fact — keep it as you go.

## 22. Explicit List of Things Claude Must NOT Overengineer

- No UI
- No Kubernetes
- No Kafka or any message broker
- No microservices
- No Terraform (unless something is genuinely a 2-minute win)
- No GraphQL
- No currency conversion / FX logic
- No complex authentication or user accounts
- No event sourcing
- No Redis (unless a specific, justified need appears — unlikely here)
- No abstract "pluggable provider framework" beyond what two real sources need

## 23. Working Rules for Claude Code (Process)

1. **Always inspect `TASKS.md` before starting any work.** Identify the
   current priority and the next unblocked task.
2. **Check for unresolved `[HUMAN]` tasks before starting any `[AI]` task that
   depends on them.** If a required human task (account creation, credential
   generation, manual verification, deployment click-through, video
   recording, etc.) is not yet marked complete, **stop and ask the user to
   confirm it's done** rather than guessing, faking, or skipping it.
3. **Update `TASKS.md` immediately after completing each meaningful task**,
   moving its checkbox to `[x]`, noting anything relevant in "Decisions made"
   or "Known trade-offs."
4. **Never mark a task `[x]` unless its verification condition has actually
   passed** (test run, manual check, etc. — as specified per task). If
   uncertain, mark `[~]` and say what's blocking completion.
5. **Ask before making a major architectural change** (e.g., changing the
   database layer, adding a new source abstraction, changing the idempotency
   strategy). Small implementation-detail choices don't need sign-off.
6. **Never commit secrets.** If a `.env` value is needed for a step, ask the
   user to provide/confirm it rather than inventing or hardcoding one.
7. **Prefer small, reviewable changes** over large batched diffs.
8. **Correctness is more important than feature count.** A smaller service
   that is provably correct beats a larger one that isn't.
9. **Unknown provider statuses default to non-collected**, full stop.
10. **Both revenue endpoints must share one canonical query or service** —
    never implement the math twice.
11. **All money is represented in minor units.**
12. **Gross collected amount is used for revenue**, never net-of-fees.
13. **No cross-currency aggregation without an explicit FX policy** — reject
    or segment by currency instead.