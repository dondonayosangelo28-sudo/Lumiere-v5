# Summary-card historical comparisons

- Total Users, Active Sessions, and Locked Accounts use actual observations of the shared browser prototype store. Snapshots are persisted in `summaryHistory` inside `lumiere.demo.store`, alongside existing records; they are shared by administrators in the same browser, not a backend.
- Sampling occurs immediately when the System Admin overview opens, then at most once every **60 seconds** while that overview is mounted. The existing one-second live-count tick checks whether a sample is due. Refreshing or navigating back does not duplicate samples within that minute.
- Snapshots store UTC epoch milliseconds and the three numeric counts. Retention is **48 hours**, capped at 2,882 records. Existing stores without snapshots remain supported.
- The comparison uses the latest real snapshot at or before `now − 24 hours`, provided it is no more than **60 seconds older** than that target. This is a one-minute-resolution comparison, not an exact event replay.
- Closed pages, sleeping devices, and throttled background tabs can leave gaps. No observations are backfilled, interpolated, or derived from the current count. If a suitable sample is missing, the indicator is `—` unless the explicit sample comparison mode below is enabled. The first snapshot cannot become a genuine comparison until a full 24 hours has elapsed.
- Change is `(current − previous) / previous × 100`, displayed to one decimal where needed. Zero-to-positive shows `New`; zero-to-zero shows `0%`. User/session increases are green and decreases red; lock and failed-sign-in increases are red and decreases green. Zero-percent and unavailable comparisons are muted gray. Up/down arrows reflect increases/decreases; zero change uses a horizontal arrow.
- Failed Sign-ins retains its existing attempt-record-based adjacent rolling-day comparison. Demo records do not generate historical snapshots retroactively.
- Counts continue updating every second; card layout, drag ordering, permissions, and navigation are unchanged. Clearing/resetting browser demo storage also clears snapshot history.

## Developer-configured sample comparison mode

`src/auth/summaryComparisonPreview.ts` exports `SUMMARY_COMPARISON_PREVIEW`. It is
**enabled for this preview**. Set `enabled: false` to require real history only.
Edit the non-negative integer baseline counts in that config to adjust examples:

| Metric | Sample baseline |
| --- | ---: |
| Total Users | 5 |
| Active Sessions | 2 |
| Locked Accounts | 2 |

These constants are not yesterday's observed values. They never enter browser
storage or `summaryHistory`, and do not create accounts, sessions, locks, or audit
records. The current value always comes from the existing live calculation.
For example, a live count of 8 users compares against 5 as `+60%`; 3 sessions
against 2 is `+50%`; 1 lock against 2 is `-50%`. These examples are not forced
current counts.

Valid genuine 24-hour history **always wins**, even when preview mode is enabled
or the recorded baseline is zero. When history is absent/stale, enabled mode uses
only the sample baseline. Each indicator's existing hover description and
accessible label explicitly identify sample comparisons and their baseline.
With preview mode disabled and no valid history, the indicator returns to `—`.
If genuine history later becomes unavailable (for example, after a sampling
gap), the enabled preview can fall back to samples again.

Both modes use the same formula, zero-baseline rules, typography, placement,
and metric-aware colors. Failed Sign-ins never uses these sample baselines.
