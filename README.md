# Canonical Revenue Metrics Service

A backend service that ingests normalized transaction data from **two sources**
(PayPal Sandbox + a deterministic seeded provider) and computes **total
collected revenue** for any date range using **one canonical definition of
"collected"**, exposed through two consistent views (summary + breakdown).

The engineering property it demonstrates: **the same number, computed the same
way, everywhere** — even as new sources or new statuses appear.

- **Live URL:** https://canonical-revenue-metrics-service.onrender.com
  (free tier — first request after idle may take ~50s to wake)
- **Stack:** TypeScript (strict) · Express · PostgreSQL (Supabase) · Pino · Zod · Vitest
- **Deploy:** Render (Web Service) + Supabase Postgres

---

## The canonical guarantee

Revenue is defined **once**, in `src/metrics/revenue.ts`:

> Revenue = sum of `gross_amount_minor` over rows where
> `canonical_status = 'COLLECTED'`, for a **single currency**, whose
> `collected_at` falls in the half-open window **`[from, to)`**.

Both `/summary` and `/breakdown` build their SQL from the **same** fragments, so
the two views can never disagree. A "drift guard" test asserts
`summary.total == Σ breakdown buckets` for both `day` and `week` intervals — it
fails if anyone reimplements the revenue math a second way.

Key rules (all enforced and tested):

- **Allow-list, not exclusion-list.** Each source maps its own raw statuses to
  canonical ones; anything unrecognized → `UNKNOWN`, which **never** counts as
  collected. A brand-new source with no policy maps everything to `UNKNOWN`.
- **Gross, not net.** Revenue uses the gross captured amount, never net-of-fees.
- **Integer minor units only.** No floats anywhere in money handling.
- **No cross-currency aggregation.** Every query is scoped to one currency.
- **Idempotent ingestion.** Unique `(source, external_id)`; re-imports and
  concurrent imports never duplicate rows.

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health` | Liveness probe |
| POST | `/api/import/seeded` | Import the deterministic seeded dataset |
| POST | `/api/import/paypal` | Import PayPal orders by ID (`{ "orderIds": [...] }`) |
| GET  | `/api/transactions` | List normalized rows (`?source=&currency=&status=&limit=`) |
| GET  | `/api/metrics/revenue/summary` | Canonical total (`?from=&to=&currency=`) |
| GET  | `/api/metrics/revenue/breakdown` | Bucketed total (`?from=&to=&currency=&interval=day\|week`) |

All query/body params are validated with Zod; invalid input returns a
structured `400`, never a `500` or a silent default.

### Example requests

```bash
BASE_URL=https://canonical-revenue-metrics-service.onrender.com   # or http://localhost:3000

# Health
curl "$BASE_URL/health"

# Import the seeded dataset (idempotent)
curl -X POST "$BASE_URL/api/import/seeded"

# Import a PayPal order (uses capture ID as the idempotency key)
curl -X POST "$BASE_URL/api/import/paypal" \
  -H 'Content-Type: application/json' \
  -d '{"orderIds":["1A876373MX123143G"]}'

# Summary — total collected USD revenue in July 2026
curl "$BASE_URL/api/metrics/revenue/summary?currency=USD&from=2026-07-01&to=2026-08-01"

# Breakdown — same total, per day (buckets always sum to the summary)
curl "$BASE_URL/api/metrics/revenue/breakdown?currency=USD&from=2026-07-01&to=2026-08-01&interval=day"

# Validation error (missing currency) -> 400
curl "$BASE_URL/api/metrics/revenue/summary?from=2026-07-01&to=2026-08-01"
```

`to` is **exclusive**: to include all of July 31, pass `to=2026-08-01`.

---

## Local setup

**Prerequisites:** Node 20 (`.nvmrc` pins it — `nvm use`), a Postgres database
(Supabase or local), and — for real PayPal imports — PayPal Sandbox credentials.

```bash
nvm use                 # Node 20
npm install
cp .env.example .env     # then fill in real values (see below)
npm run migrate          # apply migrations to your database
npm run dev              # start with reload, or: npm run build && npm start
```

### Environment variables (`.env`)

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | yes | `postgresql://user:pass@host:5432/postgres` (Supabase). Parsed structurally, so passwords may contain URL-illegal chars. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | for PayPal import | PayPal Sandbox REST app credentials. |
| `PAYPAL_API_BASE` | no | Defaults to `https://api-m.sandbox.paypal.com`. |
| `PORT` | no | Defaults to `3000` (Render injects its own). |
| `LOG_LEVEL` | no | `info` by default. |

`.env` is git-ignored. No secrets are committed anywhere.

---

## Testing

```bash
npm test                    # full suite
RUN_PAYPAL_LIVE=1 npm test  # also runs the opt-in live PayPal import test
```

Integration tests run against the real database inside a transaction that is
**rolled back**, so they leave no residue. Coverage includes all 13 critical
correctness scenarios: canonical status handling, unknown-status exclusion,
gross-not-net, idempotent re-import, concurrent import, summary == breakdown,
currency isolation, date-boundary edges, and validation errors.

The live PayPal test hits the sandbox and is off by default (sandbox orders can
expire); the PayPal **adapter** and money conversion are covered
deterministically by fixture tests based on the real captured transaction.

---

## Design decisions & trade-offs

- **Modular monolith**, not microservices — one deployable, cleanly separated by
  domain folder (`integrations/`, `transactions/`, `metrics/`, `routes/`).
- **Adapters are the only source-aware code.** Once data is canonical, nothing
  downstream cares where it came from except via the `source` column.
- **One canonical revenue module** shared by both endpoints (hard requirement).
- **Money in integer minor units**; PayPal decimal strings are converted via
  BigInt (no float), rejecting over-precise amounts.
- **Allow-list status mapping** per source; unknown/new statuses fail safe to
  `UNKNOWN`. Matching is exact — a changed spelling/case is treated as new
  (safe: it can only *under*-count, never over-count revenue).
- **Idempotency via the DB unique constraint** `(source, external_id)`, not
  application locking — so concurrent imports are safe too.
- **No auth on import endpoints** — a documented trade-off for this assignment,
  not a production stance.
- **No FX / cross-currency aggregation** — queries are single-currency by
  construction; mixing currencies is impossible, not merely discouraged.
- **PostgreSQL CHECK constraints mirror the app invariants** (currency shape,
  closed canonical-status set, `collected_at` only on `COLLECTED`,
  `gross = net + fee`) — defense in depth against bad writes.

---

## Deployment (Render + Supabase)

The repo includes a `render.yaml` blueprint. To deploy:

1. Create a **Supabase** project; copy its Postgres connection string.
2. On **Render**, create a **Web Service** from this GitHub repo (the blueprint
   sets build/start commands and the `/health` check).
3. Set env vars in the Render dashboard: `DATABASE_URL`, `PAYPAL_CLIENT_ID`,
   `PAYPAL_CLIENT_SECRET` (`PAYPAL_API_BASE` and others come from the blueprint).
4. Deploy. The start command runs migrations then boots the server.
5. Confirm the live `/health` and a metrics endpoint respond.

Build: `npm ci --include=dev && npm run build` · Start:
`npm run migrate:prod && npm start`.

---

## Sources & references

- PayPal Orders v2 API — order/capture shape, capture status values.
- PayPal OAuth 2.0 client-credentials flow.
- Supabase Postgres connection docs.
- Render Blueprint (`render.yaml`) spec.

## AI usage

This project was built with **Claude Code** under explicit, checked-in
direction: `CLAUDE.md` (engineering rules) and `TASKS.md` (phased task list with
per-task verification conditions). Each task was implemented, verified against
its condition (tests / live checks), and committed separately. See `TASKS.md`
for the decision log and the full trail. _(Add the shared conversation link per
submission requirements.)_
