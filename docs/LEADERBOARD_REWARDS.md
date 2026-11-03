# Daily placement rewards

Both the daily speed board and journey hearts board award journey tools:

| Final rank | Hints | Firefly reveals |
| --- | --- | --- |
| 1 | 5 | 3 |
| 2–3 | 3 | 2 |
| 4–10 | 1 | 1 |

Players may collect from both boards for the same UTC date. Hearts ties use
the existing competition ranking (1, 1, 3), so all players sharing a rank
get its full tier, even if this produces more than ten recipients. Speed
uses its existing ordered ranking and tie breakers. Offline practice does
not qualify. Rewards require no ad and have no cash value.

## Collection and finalization

Open **Leaderboard rewards** on Home, or **Placement rewards for this date**
from either leaderboard. Choose a competition date and claim each board's
prize. The screen defaults to yesterday. Refresh retries failed requests.

Hearts closes at midnight UTC after the competition day. Speed closes
36 hours after that midnight, allowing every previously started run its
existing 36-hour lifetime. For example, October 27 speed prizes unlock
October 29 at 12:00 UTC. The UI shows the local unlock time. No timer or
scheduled AWS job is required: authenticated claims evaluate final rankings
on demand. An unclaimed prize expires 90 days after the competition ends,
before leaderboard storage expires. Existing receipts remain retrievable.

## Integrity and saves

`POST /api/v1/rewards/claim` accepts only a board and date as input. The
authenticated profile determines the player; server rankings determine the
prize. Client-supplied amounts and ranks are ignored. Invalid dates, open
competitions, nonwinning ranks, expired claims and unauthenticated requests
are rejected. Claims are rate limited.

DynamoDB stores one permanent `PRIZE#<board>:<date>` receipt under the player
partition using a conditional write. Retries and concurrent requests return
the original receipt. No new table, IAM action or API route is needed: the
existing Terraform-managed table, UpdateItem permission and proxy route
cover this endpoint. Deploy the changed Lambda through the normal reviewed
Terraform pipeline; this document does not authorize applying production.

The app saves the receipt marker and updated inventory in one localStorage
snapshot. Storage failure rolls back memory and permits retrying the same
server receipt. Duplicate requests for a prize share one pending promise.
Receipt markers are scoped to server origin and player ID and accompany the
same production profile and inventory in cloud saves. Legacy saves migrate
without losing tools.

Inventory remains a local, whole-save system, like milestone/ad perks.
This does not provide a server wallet, anti-cheat attestation, or live balance
merging across devices. Restoring an older complete save rolls back its tools
and receipt markers together; separate devices may diverge until the user
chooses a complete cloud save. Conditional server receipts prevent duplicate
server awards, not modified clients or arbitrary local save manipulation.

Ads remain parked pending k-ID. The existing parental-consent work is still
required before enabling children's online features; these rewards do not
add that consent flow or activate k-ID. Include the new claim endpoint in
the future server permission enforcement. No version bump or APK build is
needed for code review; a backend deployment and a later app build are
required for device use.
