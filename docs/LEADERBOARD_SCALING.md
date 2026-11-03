# Leaderboard query bounds and benchmark

## Behavior

Personal ranks are exact through 1,000. Below that, `mine.rank` is the
display string `1,000+` and `mine.rankExact` is false. Within the limit,
`mine.rank` remains a number and `mine.rankExact` is true. Existing app
screens interpolate this field as text. Public top-50 entries keep numeric
ranks. Hearts ties count only strictly higher scores, including ties that
extend past the visible list or the 1,000-entry boundary.

Every production ranking query has a Limit. The remaining allowance is
reduced across DynamoDB pages, so pagination cannot bypass the bound:

| Operation | Maximum evaluated ranking rows |
| --- | ---: |
| Speed personal rank | 1,001, including own entry |
| Hearts personal rank | 1,000 strictly higher scores |
| Speed reward eligibility | 11, including own entry |
| Hearts reward eligibility | 10 strictly higher scores |
| Shared public list | 50 |

Completion responses return only personal standing and participant count.
They do not retrieve the public list or its player names. Prize checks
use a dedicated endpoint and the smaller top-10 bound; a request from the
last player costs no more ranking work than a request just below the prizes.

The shared public top 50 and its names are cached for five seconds inside
each warm Lambda instance. Concurrent requests share an in-flight promise.
The cache holds at most 128 board/date combinations; failures are evicted.
Writes invalidate the relevant local entry and renames clear the local
cache. Other instances may display a public list/name up to five seconds
old. Personal scores and ranks use fresh strongly consistent reads and
are never cached with another player's response. This is not an API-wide
or distributed cache; cold Lambda instances each make their own query.

## Reproducing the local benchmark

Start DynamoDB Local on port 8000, install both repository npm dependency
sets, then run:

```powershell
$env:DYNAMODB_ENDPOINT = 'http://127.0.0.1:8000'
node scripts/benchmark-leaderboard.mjs 100000
```

The script permits only localhost HTTP endpoints, uses fake credentials,
creates a uniquely named temporary table and removes that table in finally.
It seeds two boards and asserts evaluated-row budgets for each scenario.
The ignored report is written to `artifacts/leaderboard-benchmark.json`.
Fixture scores are synthetic and are not gameplay submissions.

Recorded November 3, 2026, against DynamoDB Local 3.3.2:

- 100,001 competitors on each board; 200,057 total rows.
- Low-ranked speed eligibility: 11 rows, one query.
- Low-ranked hearts eligibility: 10 rows, one query.
- Personal completion summaries: 1,001 speed rows / 1,000 hearts rows.
- 50 concurrent reads per board: one shared top-50 query plus 50 bounded
  personal-rank queries (50,100 speed / 50,050 hearts rows in total).
- Local observed durations: 19 ms speed summary, 13 ms hearts summary,
  308 ms for the speed burst and 187 ms for the hearts burst. These are
  observations on one workstation, not AWS latency guarantees.

Regression tests also force small paginated count responses, verify exact
rank 1,000 and capped rank 1,001, preserve prize ties, and exercise cache
coalescing, expiry, error recovery and memory bounds. Real local DynamoDB
tests cover transactions, duplicate claims and tied prize ranks outside 50.

## Remaining production capacity work

There is no whole-board ranking scan, new index, data migration or scheduled
final-ranking backfill. Bounded queries replace the need to precompute every
player's rank. Existing records work immediately with the changed backend.

Daily score keys and the shared participant counter remain potential write
hotspots under large bursts. Monitor production before deciding whether to
shard writes. On-demand capacity does not remove physical partition limits.
The local test does not simulate AWS throttling, Lambda cold starts, KMS,
network latency, API Gateway limits or sustained concurrent score writes.

Terraform adds DynamoDB read/write throttle alarms and an API Lambda p95
duration alarm at eight seconds (timeout is ten seconds). As with existing
alarms, notification routing is not configured; these are CloudWatch alarm
states, not email/pager delivery. The API remains capped at the configured
50 requests/second and burst 100 by default. No traffic cap is increased
until a staged production-like load test supports it. Consumption metrics
are available in CloudWatch; no billing budget notification is added here.

Apply monitoring and the Lambda package through the existing reviewed
Terraform pipeline. No production apply, app release build, public version
bump or ad rollout is part of this optimization.
