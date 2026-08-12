# 01 — Extract Room Resolver module

**What to build:** A new `utils/roomResolver.js` module that exports `createRoomResolver` and `createInMemoryRoomResolver`. The resolver encapsulates room resolution logic (cached roomCode lookup + fallback to `session.getActiveRoom()`), extracted from `utils/cloud.js` lines 101-136.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Create `utils/roomResolver.js` with `createRoomResolver(options)`
- [ ] `resolveActiveRoom()` returns `{ kind: 'resolved', roomCode }` when cached or fetched successfully
- [ ] `resolveActiveRoom()` returns `{ kind: 'retryable-failure', message }` when `getActiveRoom` throws or returns failure
- [ ] `resolveActiveRoom()` returns `{ kind: 'no-room' }` when session is unbound or missing
- [ ] Export `createInMemoryRoomResolver(config)` for test usage
- [ ] In-memory resolver accepts config `{ kind: 'resolved', roomCode }` or `{ kind: 'no-room' }` or `{ kind: 'retryable-failure', message }`
- [ ] Module follows existing code conventions in `utils/` (CommonJS exports, error handling patterns)
