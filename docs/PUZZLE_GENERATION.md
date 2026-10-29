# Journey puzzle generation

The generator excludes single-cell colors from newly generated Thoughtful and Challenging journey boards. They have no starter fireflies and must require an explained deduction before the first placement. Gentle boards retain easier openings; training levels 1–6 retain their original layouts and givens. Existing saved puzzles keep their regions, notes, lives, solution and generation version. Restarting a saved puzzle keeps that puzzle.

## Solving profiles

| Profile | Opening | Required explained deductions | Longest basic-placement chain |
| --- | --- | --- | --- |
| Training, levels 1–6 | 1–3 singleton colors; two givens on 4×4 or one on 5×5 | Original introductory layouts | Original introductory layouts |
| Gentle, 6×6–10×10 | 1–3 singleton colors; at most two basic placements before reasoning, or three if all three singletons are present | At least one; at least two reasoning stages on 8×8–10×10 | At most 65% of targets, rounded up |
| Thoughtful, 6×6–10×10 | Zero singleton colors, no givens, zero basic placements before a deduction | At least two; at least two stages on 8×8–10×10 | At most 65%, rounded up |
| Challenging, 6×6–10×10 | Zero singleton colors, no givens, zero basic placements before a deduction | At least three, at two or more distinct stages | At most 50%, rounded up |

A basic placement is the only remaining candidate in any row, column, or color after applying confirmed fireflies. The grader repeatedly applies all such placements. At a stall, it uses the same explained color/line, shared-line and contradiction deductions offered by hints. A board is accepted only when this process completes and meets the profile. Search-node count is diagnostic, not a difficulty rating. These are measurable solving requirements, not a guarantee of equal perceived difficulty for every player.

## Region construction

The classic generator orders targets so earlier targets eliminate non-target cells in later colors. That guarantees an easy last-cell chain. It cannot simply be given a zero-singleton setting: its construction needs an initial singleton to start that proof.

The 1.8.0 graded generator changes connected region boundaries without moving targets, preserving uniqueness after every accepted edit. It rejects long singles-only chains, but deliberately preserves the initial 1–3 singleton colors. This algorithm is retained unchanged as generateGradedPuzzle for journey-v2 replay and Gentle layouts.

For Thoughtful and Challenging, the new generator starts from a valid graded layout and lets the formerly frozen singleton colors borrow adjacent non-target cells. A donor cannot fall below two cells or disconnect. Targets stay fixed. Every edit must preserve a unique solution within a 20,000-node solver budget. Acceptance requires every color to contain at least two cells, region size at most ceil(1.8 × grid size), and a fresh logical grade with openingChain equal to zero. There are at most 24 starts of 400 boundary-edit attempts; failure reports an error rather than silently returning an obvious opening.

Training and Gentle singleton counts are selected before retries: 85% one, 13% two, 2% three (expected mean 1.17). Their region-size cap remains ceil(size² / (size − singletonCount) × 1.8). The retained v2 stage allows at most 40 starts of 250 edit attempts.

## Verification

A 3,000-board sample covered sizes 6–10, seeds 0–299 and both harder profiles. Every accepted board had no singleton colors and openingChain zero, with no generation failures. The sample took about 78 seconds in total on the development machine, with the slowest generation about 1.55 seconds while other checks were also running. Phone performance can differ; generation remains in a worker.

Automated tests check the opening deduction on empty boards, verify its exclusions against the solution, independently try the original color-single shortcut, check the full logical grade, and verify connected regions, balanced sizes, determinism and uniqueness. Tests also assert no hidden/pre-marked starter fireflies on harder journey levels. Hashes pin released v1 and v2 layouts, and the daily race layout.

## Online compatibility and rollout

Training games and old saves without a generation field use journey-v1. Earlier graded games use journey-v2. New post-training games use journey-v3. Heart submissions carry this version so the server regenerates the exact original puzzle and replays its find history. The updated server accepts all three versions; no database/schema change is needed. Cloud snapshot validation accepts all three generations too.

Deploy the updated Lambda through the existing reviewed Terraform plan/apply workflow before distributing builds that generate journey-v3 puzzles. During a staggered rollout the app retains an unsupported v2/v3 submission for retry. Existing UTC submission expiry still applies, so update the server first. Existing profiles, credited hearts, tools and levels are preserved.

Daily speed races deliberately keep their classic speed-v1 layout for compatibility with current clients and active races. This change addresses journey levels. Google Play cloud activation remains dependent on its separate Console setup described in [Google Play cloud saves](GOOGLE_PLAY_CLOUD.md).
