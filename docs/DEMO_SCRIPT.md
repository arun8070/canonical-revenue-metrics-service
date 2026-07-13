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
4. **(Recommended) Reset to empty** so the first import shows real inserts on
   camera. Either run `npm run reset` locally, or in the Supabase SQL Editor run
   `TRUNCATE TABLE transactions;`. (Skip this if you'd rather demo against
   already-loaded data — then imports will show `inserted: 0, skipped: N`.)

Expected USD/July total after importing both sources is **6600 minor units
($66.00)** across **both** PayPal and the seeded provider.

### Reset between takes

To re-run the demo cleanly, empty the table again with `npm run reset` (or
`TRUNCATE TABLE transactions;`) and repeat the imports. The schema and
migrations stay intact — no re-migration needed.

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
> "That's a real Sandbox capture — `inserted: 1`. Note we key on the **capture
> ID**, not the order ID; the capture is the actual money movement. It's stored
> with the gross amount in minor units. Now watch idempotency —"

Run the **exact same call again**:
```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"orderIds":["1A876373MX123143G"]}' \
  $BASE/api/import/paypal | jq
```
> "`inserted: 0, skipped: 1`. Re-importing never double-counts —
> `UNIQUE(source, external_id)` at the database, so revenue can't be inflated."

## Beat 5 — Import the seeded provider (25s)

```bash
curl -s -X POST $BASE/api/import/seeded | jq
```
> "A completely different shape and status vocabulary — `paid`, `succeeded`,
> `completed`. `inserted: 10`. Note `unknown: 1` — one record has a status we
> don't recognize. Hold that thought."

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

Assumes you reset to empty before recording (Beat 0).

| Call | Expected |
|------|----------|
| `/health` | `{"status":"ok",...}` |
| PayPal import (1st run) | `inserted: 1, skipped: 0` |
| PayPal import (2nd run) | `inserted: 0, skipped: 1` (idempotent) |
| Seeded import (1st run) | `inserted: 10, skipped: 0, unknown: 1` |
| Summary USD July | `totalMinor: 6600, collectedCount: 5` |
| Breakdown USD July (day) | buckets sum to `6600` |
| Transactions `status=UNKNOWN` | the `seed-0008` / `unexpected_new_status` row (8888), excluded from revenue |
| Summary without `currency` | `400 validation_error` |

> If you did **not** reset first, the import calls show `inserted: 0, skipped: N`
> instead — still a valid demo (leads with idempotency), just narrate it that way.
