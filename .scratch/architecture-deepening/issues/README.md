# Architecture Deepening Tickets

Generated from specs:
- [docs/specs/2026-08-12-separate-room-resolver.md](../../docs/specs/2026-08-12-separate-room-resolver.md)
- [docs/specs/2026-08-12-merge-room-access-modules.md](../../docs/specs/2026-08-12-merge-room-access-modules.md)
- [docs/specs/2026-08-12-inline-home-records-sync.md](../../docs/specs/2026-08-12-inline-home-records-sync.md)

## Work Breakdown

### Track A: Room Resolution (4 tickets)
- [01 — Extract Room Resolver module](01-extract-room-resolver.md)
- [02 — Integrate resolver into RoomDataClient](02-integrate-resolver.md) ← blocks: 01
- [03 — Add resolver unit tests](03-add-resolver-tests.md) ← blocks: 01
- [04 — Verify end-to-end with in-memory resolver](04-verify-resolver-integration.md) ← blocks: 02, 03

### Track B: Merge Room Access (3 tickets)
- [05 — Merge roomAccessProtocol into roomAccessOutcome](05-merge-access-protocol.md)
- [06 — Update cloud.js and room.js imports](06-update-imports.md) ← blocks: 05
- [07 — Merge tests and delete protocol file](07-merge-tests-cleanup.md) ← blocks: 05

### Track C: Inline Home Sync (3 tickets)
- [08 — Inline state machine logic into index page](08-inline-sync-state-machine.md)
- [09 — Create page behavior tests](09-create-page-tests.md) ← blocks: 08
- [10 — Delete homeRecordsSync module and tests](10-delete-sync-module.md) ← blocks: 08, 09

## Implementation Order

All three tracks are independent and can proceed in parallel. Within each track:

**Track A:** 01 → (02, 03) → 04
**Track B:** 05 → (06, 07)
**Track C:** 08 → 09 → 10

Recommended priority: A (highest leverage) → B (net simplification) → C (removes premature abstraction)

## Status

All tickets marked `ready-for-agent` and can be grabbed by agents or developers.
