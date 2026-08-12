# 03 — Add resolver unit tests

**What to build:** Create `tests/room-resolver.test.js` that tests room resolution logic in isolation, without cloud function mocks. Tests verify cached resolution, fallback to getActiveRoom, and all outcome kinds.

**Blocked by:** 01 — Extract Room Resolver module

**Status:** done

- [ ] Create `tests/room-resolver.test.js`
- [ ] Test: cached roomCode returns `{ kind: 'resolved', roomCode }` without calling `getActiveRoom`
- [ ] Test: empty cache falls back to `session.getActiveRoom()`, returns resolved with roomCode
- [ ] Test: `getActiveRoom` throws error returns `{ kind: 'retryable-failure', message }`
- [ ] Test: `getActiveRoom` returns retryable-failure outcome propagates as `{ kind: 'retryable-failure' }`
- [ ] Test: `getActiveRoom` returns unbound room returns `{ kind: 'no-room' }`
- [ ] Test: missing session object returns `{ kind: 'no-room' }`
- [ ] Test: roomCode normalization (trim, uppercase) works correctly
- [ ] All tests use fake session objects, no cloud mocks needed
