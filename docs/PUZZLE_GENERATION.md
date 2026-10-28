# Journey puzzle generation

Version 1.8.0 changes newly generated journey puzzles from level 7 onward. Training levels 1–6 retain their original layouts and starter fireflies. Saved games retain their existing regions, notes, lives, and solution; restarting a saved puzzle keeps that puzzle.

The previous generator guaranteed uniqueness by ordering the targets and allowing each color's non-target cells only where an earlier target could eliminate them. This guaranteed a chain of last-cell colors. Its difficulty setting changed region balance, not the required reasoning.

The new generator starts from a valid connected board and changes region boundaries. Targets stay fixed. An edit is rejected if it disconnects a color, changes the selected singleton count, exceeds the region-size cap, or creates multiple solutions. The board is accepted only after a logical solve meets its profile. Search-node count is retained for diagnostics but does not grade difficulty.

The logical grader repeatedly applies confirmed-firefly exclusions and every single remaining candidate in a row, column, or color. When those moves stall, it uses the same explained color/line, shared-line, and contradiction deductions offered by hints. It accepts only puzzles that this process completes.

| Measure | Requirement |
| --- | --- |
| Opening basic-placement chain | At most two targets, or the singleton count if three |
| Explained deductions | At least 1 / 2 / 3 for Gentle / Thoughtful / Challenging |
| Distinct stages needing deductions | At least two on 8×8–10×10; also on Challenging smaller boards with enough non-singleton colors |
| Longest uninterrupted basic-placement chain | At most 65% of the targets; 50% on Challenging, rounded up |

The rare 6×6 board with three singleton colors uses at most two required deductions and one reasoning stage because only three targets remain after the singletons. Every non-training board must require an explained deduction. These are measurable solving profiles, not a guarantee that every player experiences the same difficulty.

Singleton counts are selected before retries: 85% one, 13% two, 2% three (expected mean 1.17). Retries retain that choice. No color exceeds `ceil(size² / (size − singletonCount) × 1.8)` cells. Edits have a 20,000-node uniqueness budget. Generation has at most 40 restarts of 250 edit attempts and reports an error rather than silently falling back to an easy chain.

Validation sampled all sizes 6–10 and seeds 0–999, rotating the three difficulty profiles: 5,000 puzzles, no generation failures, with the slowest generation about 185 ms on the development machine. Automated tests independently simulate the original color-single shortcut, verify actual grading thresholds, and retain connectivity, determinism, region-size, and unique-solution checks. Phone performance can differ.

## Online compatibility and rollout

New post-training journey games carry `generation: journey-v2`. Old saves without this field and training games use `journey-v1`. Heart submissions carry the puzzle generation so the server can regenerate the exact layout and replay its find history. The updated server accepts both generations. Tests pin released legacy and daily layouts with hashes.

Daily speed races keep their existing generator and `speed-v1` layout for compatibility with current clients and active races. This change addresses journey levels.

Deploy the updated Lambda through the existing reviewed Terraform plan/apply workflow before distributing 1.8.0. No database or schema change is required. The new app retains a v2 submission if an older server responds with its unknown-puzzle-version error; it can retry once the updated server is available. Existing UTC submission expiry still applies, so deploy the server first. Pending v1 replays remain valid after deployment.
