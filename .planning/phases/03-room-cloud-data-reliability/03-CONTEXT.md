# Phase 3: Room and Cloud Data Reliability - Context

**Gathered:** 2026-06-26  
**Status:** Historical backfill

<domain>
## Phase Boundary

Keep shared-room data access trustworthy and recoverable. Historical work includes server-side record validation, frontend room session/cache logic, and server-side leave/unpair behavior with ownership transfer.
</domain>

<decisions>
## Implementation Decisions

### Server-side authorization and validation
- **D-01:** Room-scoped data access must remain server-side in `cloudfunctions/dataOp/index.js`.
- **D-02:** Period and memory writes should be normalized and validated by `cloudfunctions/dataOp/roomRecords.js`, not only client code.

### Room lifecycle
- **D-03:** Leaving/unpairing a room must go through `cloudfunctions/leaveRoom/index.js`.
- **D-04:** If the creator leaves while a partner remains, transfer ownership instead of leaving an ownerless room.
- **D-05:** If the last member leaves, delete the room document.

### Client recovery
- **D-06:** Frontend room-code cache, recovery, create/join, leave, and local clear behavior are centralized in `utils/room.js`.

### the agent's Discretion
- Local pure Node tests can stand in for cloud-function unit behavior where WeChat runtime deployment is not available.
</decisions>

<specifics>
## Specific Ideas

The phase maps primarily to commit `605adf3`.
</specifics>

<canonical_refs>
## Canonical References

- `.planning/PROJECT.md` - room-sharing constraints.
- `.planning/REQUIREMENTS.md` - ROOM-01 through ROOM-04 and related quality requirements.
- `docs/adr/0001-room-leave-ownership-transfer.md` - ownership transfer decision.
- `utils/room.js` - frontend room session module.
- `utils/cloud.js` - frontend cloud wrapper.
- `cloudfunctions/dataOp/index.js` and `cloudfunctions/dataOp/roomRecords.js` - data gateway and validation.
- `cloudfunctions/leaveRoom/index.js` and `cloudfunctions/leaveRoom/roomLifecycle.js` - leave/unpair behavior.
- `tests/room-records.test.js`, `tests/room-session.test.js`, `tests/room-lifecycle.test.js` - automated coverage.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RoomRecords` normalizes allowed fields, dates, duration, flow, symptoms, and room-scoped CRUD access.
- `RoomSession` centralizes local cache/recovery/create/join/leave/local-clear flows.
- `RoomLifecycle` handles leave/unpair ownership transfer and cleanup.

### Integration Points
- Bind-page unbind calls server-side `leaveRoom`.
- Settings local cache clear intentionally remains local-only.
</code_context>

<deferred>
## Deferred Ideas

- Broader deployed cloud-function adapter tests for create/join/recover/leave.
- Manual WeChat DevTools unbind verification.
</deferred>

---
*Phase: 03-room-cloud-data-reliability*
*Context backfilled: 2026-06-26*
