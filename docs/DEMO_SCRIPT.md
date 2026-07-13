# Demo Script (≤ 5 minutes)

Live service: **https://canonical-revenue-metrics-service.onrender.com**

## Before you hit record

1. **Warm the free instance** (cold start is ~50s): run this once and wait for `{"status":"ok"}`:
   ```bash
   curl -s https://canonical-revenue-metrics-service.onrender.com/health
   ```
2. Set a shell variable and (optionally) install `jq` for pretty output:
   ```bash
   BASE=https://canonical-revenue-metrics-service.onrender.com
   # If `jq` isn't installed, replace `| jq` with `| python3 -m json.tool`
   ```
3. Have two things open: a terminal, and the file `src/metrics/revenue.ts` (the single canonical definition).

The live DB already holds the demo data (10 seeded + 1 real PayPal). Expected
USD/July total is **6600 minor units ($66.00)** across **both** sources.

---

## Beat 1 — What this is (20s)

> "This service answers one question — *how much revenue did we actually
> collect between two dates?* — with one canonical definition, across multiple
> payment sources, so the number never drifts. Two real sources feed it: PayPal
> Sandbox and a deterministic seeded provider with a totally different shape."

## Beat 2 — It's live (15s)

```bash
curl -s $BASE/health | jq
```
> "Deployed on Render, backed by Supabase Postgres."

## Beat 3 — One definition, in one place (25s)

Show `src/metrics/revenue.ts`, point at the shared fragments:
> "Revenue is defined *once* — sum of `gross_amount_minor` where
> `canonical_status = COLLECTED`, single currency, on `collected_at`. Both the
> summary and breakdown endpoints build from these same fragments. There is no
> second copy of the formula."

## Beat 4 — Import the real PayPal capture (40s)

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"orderIds":["1A876373MX123143G"]}' \
  $BASE/api/import/paypal | jq
```
> "That's a real Sandbox capture. Note we key on the **capture ID**, not the
> order ID — the capture is the actual money movement. It's stored with the
> gross amount in minor units. Because it's already imported, watch —"

Run it **again** to show idempotency:
```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"orderIds":["1A876373MX123143G"]}' \
  $BASE/api/import/paypal | jq
```
> "`inserted: 0, skipped: 1`. Re-importing never double-counts —
> `UNIQUE(source, external_id)` at the database."

## Beat 5 — Import the seeded provider (25s)

```bash
curl -s -X POST $BASE/api/import/seeded | jq
```
> "Completely different shape and status vocabulary — `paid`, `succeeded`,
> `completed`. `inserted: 0, skipped: 10` here too because it's deterministic
> and already loaded. Note `unknown: 1` — one record has a status we don't
> recognize. Hold that thought."

## Beat 6 — The one number, across both sources (30s)

```bash
curl -s "$BASE/api/metrics/revenue/summary?currency=USD&from=2026-07-01&to=2026-08-01" | jq
```
> "$66.00 collected in July — **6600 minor units, 5 transactions**, blending
> PayPal *and* seeded revenue into one canonical figure."

## Beat 7 — Same number, bucketed — and they agree (30s)

```bash
curl -s "$BASE/api/metrics/revenue/breakdown?currency=USD&from=2026-07-01&to=2026-08-01&interval=day" | jq
```
> "Same total, 6600, split by day. Sum the buckets and you get exactly the
> summary. A drift-guard test asserts this equality — if anyone reimplemented
> the math a second way, that test fails."

## Beat 8 — Edge case: unknown status is excluded (30s)

```bash
curl -s "$BASE/api/transactions?source=seeded&status=UNKNOWN" | jq
```
> "Here's that record — `unexpected_new_status`, an 8888-minor amount, mapped to
> `UNKNOWN`. It is **not** in the 6600. We use an **allow-list**: only
> explicitly approved statuses count, so any new or unknown status fails safe to
> non-revenue. That's the core safety property."

## Beat 9 — Edge case: invalid input is rejected cleanly (20s)

```bash
curl -s "$BASE/api/metrics/revenue/summary?from=2026-07-01&to=2026-08-01" | jq
```
> "Missing currency → a structured 400, not a 500 or a silently-wrong default.
> Every param is Zod-validated. We also never sum across currencies."

## Beat 10 — Close (20s)

> "So: two real sources, one canonical schema, one revenue definition shared by
> both endpoints, gross-in-minor-units, currency-isolated, idempotent, unknown
> statuses excluded — 50 tests including the drift guard and all 13 correctness
> scenarios. Live on Render + Supabase."

---

## Quick reference — expected results

| Call | Expected |
|------|----------|
| `/health` | `{"status":"ok",...}` |
| PayPal import (2nd run) | `inserted: 0, skipped: 1` |
| Seeded import (2nd run) | `inserted: 0, skipped: 10, unknown: 1` |
| Summary USD July | `totalMinor: 6600, collectedCount: 5` |
| Breakdown USD July (day) | buckets sum to `6600` |
| Transactions `status=UNKNOWN` | the `seed-0008` / `unexpected_new_status` row (8888), excluded from revenue |
| Summary without `currency` | `400 validation_error` |
