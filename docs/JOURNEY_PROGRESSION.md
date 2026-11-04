# Journey size progression

New journey puzzles use the following phases:

| Levels | Label | Sizes |
| --- | --- | --- |
| 1-3 | Training | 4 by 4, two starter fireflies |
| 4-6 | Training | 5 by 5, one starter firefly |
| 7-12 | Easy | 6 by 6 and 7 by 7 |
| 13-32 | Medium | 7 by 7 and 8 by 8 |
| 33 onward | Hard | 8 by 8, 9 by 9 and 10 by 10 |

Each post-training phase uses deterministic shuffled bags of its allowed
sizes. Every complete bag includes every size once, so hard levels never
settle permanently at 10 by 10. Size depends on the level number, not the
puzzle seed or generation retries. The Home preview, worker and AWS replay
therefore agree. Adjacent bags can repeat a size at their boundary.

Difficulty is separate from size: Easy uses reasoning tier 0, Medium tier 1,
and Hard tier 2. Medium and Hard puzzles retain deduction-led openings
without singleton colors. Hard puzzles require the existing hard reasoning
profile even on an 8 by 8 board.

## Save and leaderboard compatibility

Post-training puzzles are now stamped journey-v4. Training keeps its
released journey-v1 layouts. All three previous generation versions preserve
their size schedules, layouts, givens and replay behavior.

An in-progress saved puzzle keeps its board, crosses, lives, elapsed time
and original difficulty label. New progression starts with the next new
level. Restarting an unfinished puzzle still restarts that same board.
Cloud saves accept v4 puzzles and pending heart submissions.

Deploy the updated Lambda through the normal Terraform approval pipeline
before distributing a new app build. An old server rejects v4 replay;
the app retains those submissions for retry until the existing UTC deadline.
No app version bump, APK/AAB build or production apply accompanies this
source change.
