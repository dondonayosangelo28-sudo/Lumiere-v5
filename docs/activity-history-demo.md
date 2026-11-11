# Activity chart preview data

Opening the System Admin overview seeds synthetic sign-in and matching audit records once.
`seedActivityHistoryDemo.ts` defines varied daily volumes across Manila calendar days
3–29 before the seed date, including intentionally empty days. Every record is labeled
as synthetic chart-preview data in its reason or audit description.

Select **Last 30 Days** in Sign-in Activity and Audit Activity to see the full history.
The existing Last 7 Days audit filter also includes part of the preview. No new month
filter is added: the existing 30-day options represent the month-length preview.

The seed does not modify existing timestamps, accounts, sessions, locks, or genuine
summary snapshots. It leaves the most recent 48 hours untouched. Samples share the
normal chart selectors and GMT+8 grouping, persist in browser storage, and are not
regenerated on refresh. They age out of the filters naturally. Existing records take
priority if the configured browser-storage caps leave insufficient room for samples.
