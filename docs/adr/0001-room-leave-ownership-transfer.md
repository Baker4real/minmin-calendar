# ADR: Room Leave Transfers Ownership to the Remaining Member

**Status:** Accepted
**Date:** 2026-06-25
**Updated:** 2026-07-01

## Context

Room membership used to be cleared only from local storage. That left the WeChat Cloud `rooms` document unchanged, so the same user could recover access from the server after a local unbind.

The app needs an explicit server-side leave path that removes the current `OPENID` from room membership while preserving the remaining member's access to shared records.

## Decision

Add a `leaveRoom` cloud function backed by a tested `RoomLifecycle` Module.

When a partner leaves, the room keeps the creator and returns to `waiting`.

When the creator leaves a paired room, the partner becomes the creator, the partner slot is cleared, and the room returns to `waiting`.

When the last member leaves, the room is no longer deleted. Empty-room lifecycle and recovery are covered by [ADR 0004](0004-empty-room-archive-recovery.md).

The client `RoomSession.leaveRoom()` clears local `roomCode` only after the server leave succeeds.

## Consequences

- Local storage is now treated as cache for the unbind flow, not as the source of membership truth.
- The remaining member keeps access to existing shared records and can invite a new partner with the same room code.
- Empty rooms preserve their `roomCode` for explicit recovery instead of relying on local cache or orphan records.
- WeChat DevTools CLI confirmed `leaveRoom` is deployed with status `Active` in `cloud1-d8gyqvcez4e66b3da`; end-to-end unbind acceptance still requires simulator or device verification.
