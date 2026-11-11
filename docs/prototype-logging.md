# Audit Logs and Security: browser-storage prototype

This implementation is a synthetic, client-side demonstration, **not production
authentication or authoritative logging**. Role checks in the UI and mock service
are useful prototype behavior, not a security boundary. Users and browser scripts
can inspect, modify, erase, or replace local storage, credentials, sessions, and logs.
There is no claim of standards compliance, tamper resistance, or durable retention.

## Record behavior

- Each sign-in execution gets a fresh operation ID. Its login-attempt record and
  corresponding audit event share a `correlationId`; an account-lock event caused
  by that attempt uses the same ID. Independent identical attempts are recorded
  individually, even in the same millisecond.
- Mock service callbacks run inside a synchronous operation scope after simulated
  latency. Multiple actions caused by one operation can share a correlation ID.
  Replaying an audit action with the same operation ID, action, and target returns
  the existing event. Without an explicit/scoped ID, a recorder call is a new
  operation. Retries must reuse an ID only when they represent the same operation.
  Never keep the synchronous operation scope open across an `await`.
- Actor first/last names, display name, email, and role are snapshots. Historical
  filters do not consult today's profile. Old records without first/last snapshots
  use their recorded display name (first word/remainder), an inherently imperfect
  fallback for compound names. Missing historical correlation IDs remain missing;
  neither names nor links are invented or backfilled from current accounts.
- Secret-bearing changed fields are omitted; token-shaped values are redacted.
  Do not put passwords, OTPs, tokens, or session credentials in descriptions.
- `src/auth/prototypeStorageLimits.ts` is the single source for the existing
  browser-demo capacity limits: 500 login attempts, 1,000 audit events, 200 sessions.
  Newest records are retained. These are prototype storage limits, **not** a time
  retention policy. Deduplication only covers retained records. Session limits
  preserve the existing prototype behavior; they are not a production session policy.
- Storage notifications refresh both existing sections, including across tabs.
  Local-storage writes are not transactional across tabs and may race. Storage
  failure can leave changes in memory only. Demo reset deliberately clears data.

## Required authoritative backend work

1. Authenticate requests and enforce actor identity, authorization, role restrictions,
   lifecycle protections, and session rules on the server, including direct API calls.
2. Record outcomes server-side with server-assigned identities, timestamps, immutable
   actor snapshots, and shared operation/correlation IDs. Commit account/session
   changes and event creation atomically, or use a reliable transactional outbox.
3. Implement durable idempotency keys with scoped uniqueness constraints and defined
   retry semantics; browser-generated IDs alone do not guarantee exactly-once writes.
4. Protect logs from application-user modification/deletion with least-privilege
   storage access, restricted readers, monitored administrative access, and an
   appropriate independently protected append-only or integrity-verifiable archive.
5. Define retention, archival, deletion, backups, restore testing, privacy boundaries,
   and operational monitoring based on actual product/legal requirements. Replace
   browser caps with server pagination and a documented retention policy.
6. Apply structured allowlists/redaction before ingestion and transport. Audit denied
   access and failure outcomes without collecting credentials or unnecessary personal
   data. Obtain an independent security review before production use.

## Regression check

Run `node --experimental-strip-types scripts/verify-audit-security.mjs` using the
project's Node toolchain. It runs against isolated in-memory storage and never
changes browser data. Also run `pnpm build` and `pnpm exec tsc --noEmit`.
