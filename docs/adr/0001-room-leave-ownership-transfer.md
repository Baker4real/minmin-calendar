# ADR: Room Leave Transfers Ownership to the Remaining Member

**Status:** Accepted
**Date:** 2026-06-25
**Updated:** 2026-07-10

## Context

Room membership used to be cleared only from local storage. That left the WeChat Cloud `rooms` document unchanged, so the same user could recover access from the server after a local unbind.

The app needs an explicit server-side leave path that removes the current `OPENID` from room membership while preserving the remaining member's access to shared records.

## Decision

Room membership lifecycle is implemented by the canonical `cloudfunctions/_shared/roomMembershipLifecycle.js`. The `createRoom`, `joinRoom`, `getMyRoom`, and `leaveRoom` cloud functions each deploy a local, byte-identical `roomMembershipLifecycle.js` artifact generated from that canonical source.

Membership changes run inside `db.runTransaction`. Leaving and ownership transfer read and validate the current `rooms` and `roomMembers` documents, then update both as one atomic operation; a failed transaction rolls back the complete change.

When a partner leaves, the room keeps the creator and returns to `waiting`.

When the creator leaves a paired room, the partner becomes the creator, the partner slot is cleared, and the room returns to `waiting`.

When the last member leaves, the room is no longer deleted. Empty-room lifecycle and recovery are covered by [ADR 0004](0004-empty-room-archive-recovery.md).

The client `RoomSession.leaveRoom()` clears local `roomCode` only after the server leave succeeds.

## Consequences

- Local storage is now treated as cache for the unbind flow, not as the source of membership truth.
- The remaining member keeps access to existing shared records and can invite a new partner with the same room code.
- Empty rooms preserve their `roomCode` for explicit recovery instead of relying on local cache or orphan records.
- Historical deployment record: WeChat DevTools CLI confirmed a previous `leaveRoom` version was `Active` in `cloud1-d8gyqvcez4e66b3da`. The canonical artifact refactor described by this ADR has not been deployed to the cloud; it still requires the README / ADR 0002 maintenance-window rollout order followed by cloud transaction, unique-index, artifact, and end-to-end smoke verification.
